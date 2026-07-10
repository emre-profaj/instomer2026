const DAY_MAP = {
    'monday': 1, 'pazartesi': 1,
    'tuesday': 2, 'salı': 2, 'sali': 2,
    'wednesday': 3, 'çarşamba': 3, 'carsamba': 3,
    'thursday': 4, 'perşembe': 4, 'persembe': 4,
    'friday': 5, 'cuma': 5,
    'saturday': 6, 'cumartesi': 6,
    'sunday': 0, 'pazar': 0
};

const DAY_NAMES_TR = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

function parseTime(timeStr) {
    if (!timeStr) return null;
    const [h, m] = timeStr.split(':').map(Number);
    return { hours: h, minutes: m || 0 };
}

function setTime(date, timeStr) {
    const t = parseTime(timeStr);
    if (!t) return date;
    const d = new Date(date);
    d.setHours(t.hours, t.minutes, 0, 0);
    return d;
}

function addMinutes(date, mins) {
    return new Date(date.getTime() + mins * 60000);
}

function formatTime(date) {
    return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
}

let params = { date: '2026-07-10' };
let dateRangeDays = 1;
let startDate = params.date ? new Date(params.date) : new Date();
if (startDate < new Date()) {
    startDate = new Date();
}
startDate.setHours(0, 0, 0, 0);

let providers = [{
    id: 1, name: 'Doctor',
    workStart: '09:00',
    workEnd: '18:00',
    workingDays: ['monday','tuesday','wednesday','thursday','friday'],
    slotMinutes: 15,
    type: 'doctor'
}];

const busySlots = [];
const allSlots = [];

for (const provider of providers) {
    for (let day = 0; day < dateRangeDays; day++) {
        const currentDay = new Date(startDate);
        currentDay.setDate(currentDay.getDate() + day);
        
        const dayOfWeek = currentDay.getDay();
        
        let slotStart = setTime(currentDay, provider.workStart);
        const dayEnd = setTime(currentDay, provider.workEnd);

        // Simulate "now" as 10:55 TRT
        // Using current time since I will run this script
        const now = new Date(); // It is 11:38 TRT currently. I will hardcode "now" to 10:55 TRT
        const fakeNow = new Date('2026-07-10T10:55:00+03:00');
        
        console.log("Slot Start initially:", slotStart.toISOString(), "Local:", slotStart.toString());
        console.log("Fake Now:", fakeNow.toISOString(), "Local:", fakeNow.toString());

        if (slotStart < fakeNow) {
            const minutesSinceStart = Math.ceil((fakeNow - slotStart) / 60000);
            const slotsToSkip = Math.ceil(minutesSinceStart / provider.slotMinutes);
            slotStart = addMinutes(slotStart, slotsToSkip * provider.slotMinutes);
            console.log("Skipped slots:", slotsToSkip, "New Slot Start:", slotStart.toISOString());
        }

        while (slotStart < dayEnd) {
            const slotEnd = addMinutes(slotStart, provider.slotMinutes);
            allSlots.push(formatTime(slotStart));
            slotStart = slotEnd;
            if (allSlots.length > 12) break;
        }
    }
}
console.log(allSlots);
