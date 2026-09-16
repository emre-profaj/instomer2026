/**
 * ═══════════════════════════════════════════════════════════════
 * MÜKERRER ARAMA KORUMASI — ORTAK
 * ═══════════════════════════════════════════════════════════════
 *
 * Ölçüm (16 Eylül 2026, son 30 gün): 152 numaraya aynı saat diliminde
 * IKISI DE ilk deneme olan birden fazla arama planlanmış. Yani müşteri
 * arka arkaya iki kez aranmış.
 *
 * İki ayrı sebep vardı:
 *
 * 1) DURUM FİLTRESİ DAR — activity.controller yalnızca PENDING ve
 *    IN_PROGRESS aramalara bakıyordu. İlk arama CANCELLED veya COMPLETED
 *    olduğunda ikinci bir arama oluşturulabiliyordu. Canlı örnek: aynı
 *    activity_cd8fd917… etiketiyle 14.09 06:05'te biri CANCELLED biri
 *    COMPLETED iki kayıt.
 *
 * 2) TELEFON KONTROLÜ YOK — activity.controller yalnızca "bu aktivite
 *    için kayıt var mı" diye bakıyordu, checkOverdueAgentCalls ise hiç
 *    bakmıyordu. Farklı kaynaklardan aynı numaraya iki arama planlanabiliyordu.
 *
 * Numaralar veritabanında tek biçimde değil (7–27 hane, kimi + ile kimi
 * değil), bu yüzden metin karşılaştırması güvenilmez. Son 10 hane
 * üzerinden eşleştiriyoruz — Türkiye için GSM numarasının kendisi.
 */

/** Numaranın karşılaştırılabilir hâli: yalnızca son 10 hane. */
export function phoneKey(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    return digits.length >= 10 ? digits.slice(-10) : digits;
}

/**
 * Bu numaraya yakın zamanda zaten bir arama planlanmış mı?
 *
 * Tekrar denemeleri (attemptNumber > 1) KASITLI OLARAK sayılmaz: onlar
 * bilinçli bir zincirin parçası, mükerrer değil.
 *
 * @param {object}  prisma
 * @param {object}  opts
 * @param {string}  opts.workspaceId
 * @param {string}  opts.phone
 * @param {Date}   [opts.aroundDate]   — planlanan zaman (varsayılan: şimdi)
 * @param {number} [opts.windowHours]  — kaç saatlik pencerede arasın (varsayılan 24)
 * @returns {Promise<object|null>} çakışan kayıt veya null
 */
export async function findRecentCallForPhone(prisma, {
    workspaceId,
    phone,
    aroundDate = new Date(),
    windowHours = 24,
} = {}) {
    const key = phoneKey(phone);
    if (!workspaceId || key.length < 7) return null;

    const ms = windowHours * 60 * 60 * 1000;

    // Numara biçimi tek tip olmadığı için SQL'de eşleştiremiyoruz:
    // pencereyi çekip son 10 hane üzerinden JS'te karşılaştırıyoruz.
    // Hacim düşük (haftada ~600 kayıt), pencere başına birkaç on satır.
    const candidates = await prisma.scheduledCall.findMany({
        where: {
            workspaceId,
            attemptNumber: 1,
            status: { in: ['PENDING', 'IN_PROGRESS', 'COMPLETED'] },
            scheduledAt: {
                gte: new Date(aroundDate.getTime() - ms),
                lte: new Date(aroundDate.getTime() + ms),
            },
        },
        select: {
            id: true, toNumber: true, scheduledAt: true,
            status: true, createdById: true,
        },
        orderBy: { scheduledAt: 'desc' },
        take: 200,
    });

    return candidates.find(c => phoneKey(c.toNumber) === key) || null;
}

/**
 * Planlamadan önce çağrılır. Çakışma varsa günlüğe yazıp true döner.
 *
 * @returns {Promise<boolean>} true → ATLA, false → planlamaya devam et
 */
export async function shouldSkipDuplicateCall(prisma, opts, label = 'Call') {
    const existing = await findRecentCallForPhone(prisma, opts);
    if (!existing) return false;

    const ne = existing.scheduledAt?.toLocaleString?.('tr-TR', { timeZone: 'Europe/Istanbul' }) || '?';
    console.log(
        `⏭️ [${label}] Mükerrer atlandı — ...${phoneKey(opts.phone).slice(-4)} için ` +
        `${ne} tarihinde ${existing.status} bir arama zaten var (kaynak: ${String(existing.createdById || '').slice(0, 24)})`
    );
    return true;
}
