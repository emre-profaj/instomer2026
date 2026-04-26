import prisma from '../lib/prisma.js';

// ────────────────────────────────────────────────────────────────────────────
// CREATE ACTIVITY
// ────────────────────────────────────────────────────────────────────────────
export const createActivity = async (req, res) => {
    try {
        const { contactId } = req.params;
        const { workspaceId, type, title, description, dueDate, assignedToId, teamId } = req.body;
        const userId = req.user.id;

        // Yetki Kontrolü
        const contact = await prisma.contact.findFirst({
            where: { id: contactId, workspaceId }
        });

        if (!contact) {
            return res.status(404).json({ error: 'Kişi bulunamadı veya bu workspace\'e ait değil.' });
        }

        const newActivity = await prisma.contactActivity.create({
            data: {
                contactId,
                workspaceId,
                type,
                title,
                description,
                dueDate: dueDate ? new Date(dueDate) : null,
                assignedToId: assignedToId ? assignedToId : null,
                teamId: teamId ? teamId : null,
                createdBy: userId
            },
            include: {
                creator: { select: { name: true, role: true } },
                assignee: { select: { name: true } },
                team: { select: { name: true } }
            }
        });

        res.status(201).json(newActivity);
    } catch (error) {
        console.error('Create Activity Error:', error);
        res.status(500).json({ error: 'Etkinlik oluşturulurken bir hata oluştu.' });
    }
};

// ────────────────────────────────────────────────────────────────────────────
// GET CONTACT TIMELINE
// ────────────────────────────────────────────────────────────────────────────
export const getContactTimeline = async (req, res) => {
    try {
        const { contactId } = req.params;
        const { workspaceId } = req.query; // Query'den veya token'dan gelebilir

        let activities = [];
        let conversations = [];
        let internalNotes = [];
        let appointments = [];

        // 1. Contact Activities (Not, Görev, Hatırlatıcı, Görüşme)
        try {
            activities = await prisma.contactActivity.findMany({
                where: { contactId },
                include: {
                    creator: { select: { name: true, role: true, teamMemberships: { include: { team: true } } } },
                    assignee: { select: { name: true } }
                },
                orderBy: { createdAt: 'desc' }
            });
        } catch (e) {
            console.error('Timeline Activities Error:', e.message);
        }

        // 2. Mesajlar (WhatsApp, E-posta, vb.)
        try {
            conversations = await prisma.conversation.findMany({
                where: { contactId },
                include: {
                    messages: {
                        include: {
                            sender: { select: { name: true, role: true, teamMemberships: { include: { team: true } } } }
                        },
                        orderBy: { createdAt: 'desc' }
                    }
                }
            });
        } catch (e) {
            console.error('Timeline Conversations Error:', e.message);
        }

        // 3. Mevcut İç Notlar (Internal Notes)
        try {
            internalNotes = await prisma.internalNote.findMany({
                where: { conversation: { contactId } },
                include: {
                    user: { select: { name: true, role: true, teamMemberships: { include: { team: true } } } }
                },
                orderBy: { createdAt: 'desc' }
            });
        } catch (e) {
            console.error('Timeline InternalNotes Error:', e.message);
        }

        // 4. Eski Randevu ve Görevler (Appointments)
        try {
            appointments = await prisma.appointment.findMany({
                where: { contactId },
                orderBy: { startTime: 'desc' }
            });
            // Appointment modelinde assignedTo relation yok, manuel olarak çek
            if (appointments.length > 0) {
                const agentIds = [...new Set(appointments.map(a => a.assignedToId).filter(Boolean))];
                const agents = agentIds.length > 0 ? await prisma.user.findMany({
                    where: { id: { in: agentIds } },
                    select: { id: true, name: true, role: true, teamMemberships: { include: { team: true } } }
                }) : [];
                const agentMap = {};
                agents.forEach(a => { agentMap[a.id] = a; });
                appointments = appointments.map(apt => ({ ...apt, assignedTo: agentMap[apt.assignedToId] || null }));
            }
        } catch (e) {
            console.error('Timeline Appointments Error:', e.message);
        }

        // Tümünü tek bir timeline array'inde birleştir
        const timeline = [];

        // Aktiviteleri ekle
        activities.forEach(act => {
            let labelName = act.creator?.name || 'Sistem';
            // Eğer takım bilgisi varsa ismin yanına (Satış) gibi ekle
            if (act.creator?.teamMemberships && act.creator.teamMemberships.length > 0) {
                labelName += ` (${act.creator.teamMemberships[0].team.name})`;
            }

            timeline.push({
                id: `act_${act.id}`,
                sourceType: 'ACTIVITY',
                type: act.type, // NOTE, REMINDER, TASK, MEETING
                title: act.title,
                content: act.description,
                date: act.createdAt,
                dueDate: act.dueDate,
                isCompleted: act.isCompleted,
                labelName,
                assignedToName: act.assignee?.name,
                raw: act
            });
        });

        // Mesajları ekle — her konuşma için özet + son 2 mesaj
        conversations.forEach(conv => {
            let type = 'MESSAGE';
            if (conv.channel === 'WHATSAPP') type = 'WHATSAPP';
            else if (conv.channel === 'EMAIL') type = 'EMAIL';
            else if (conv.channel === 'FACEBOOK') type = 'FACEBOOK';
            else if (conv.channel === 'INSTAGRAM') type = 'INSTAGRAM';
            else if (conv.channel === 'WIDGET') type = 'WIDGET';

            // Son 2 mesajı al (messages zaten desc sıralı)
            const recentMessages = (conv.messages || []).slice(0, 2).map(msg => {
                let senderName = 'Sistem';
                if (msg.isFromContact) {
                    senderName = 'Müşteri';
                } else if (msg.sender) {
                    senderName = msg.sender.name;
                    if (msg.sender.teamMemberships && msg.sender.teamMemberships.length > 0) {
                        senderName += ` (${msg.sender.teamMemberships[0].team.name})`;
                    }
                }
                return {
                    id: msg.id,
                    content: msg.content?.substring(0, 120) || '',
                    senderName,
                    isFromContact: msg.isFromContact,
                    date: msg.createdAt
                };
            });

            // Toplam mesaj sayısı
            const totalMessages = conv.messages?.length || 0;
            const lastMessage = conv.messages?.[0];
            const lastMessageDate = lastMessage?.createdAt || conv.lastMessageAt || conv.createdAt;

            // Konuşma başına tek satır özet
            let summaryContent = '';
            if (recentMessages.length > 0) {
                summaryContent = recentMessages.map(m => 
                    `${m.senderName}: ${m.content}`
                ).join('\n');
            }

            // Konuşmayı tek bir timeline girişi olarak ekle
            timeline.push({
                id: `conv_${conv.id}`,
                sourceType: 'CONVERSATION',
                type: type,
                title: type === 'EMAIL' ? (lastMessage?.emailSubject || 'E-posta') : 
                       (conv.channel === 'WHATSAPP' ? 'WhatsApp' : 
                        conv.channel === 'FACEBOOK' ? 'Facebook' : 
                        conv.channel === 'INSTAGRAM' ? 'Instagram' : 
                        conv.channel === 'WIDGET' ? 'Web Widget' : 'Sohbet'),
                content: summaryContent,
                date: lastMessageDate,
                totalMessages,
                recentMessages,
                conversationId: conv.id,
                labelName: `${totalMessages} mesaj`,
                raw: { id: conv.id, channel: conv.channel }
            });
        });

        // Internal Notes (Eskiden kalanlar)
        internalNotes.forEach(note => {
            let labelName = note.user?.name || 'Sistem';
            if (note.user?.teamMemberships && note.user.teamMemberships.length > 0) {
                labelName += ` (${note.user.teamMemberships[0].team.name})`;
            }

            timeline.push({
                id: `inote_${note.id}`,
                sourceType: 'ACTIVITY',
                type: 'NOTE',
                title: 'Not',
                content: note.content,
                date: note.createdAt,
                labelName,
                raw: note
            });
        });

        // Appointments (Eskiden kalanlar veya farklı eklenenler)
        appointments.forEach(apt => {
            let labelName = apt.assignedTo?.name || 'Sistem';
            if (apt.assignedTo?.teamMemberships && apt.assignedTo.teamMemberships.length > 0) {
                labelName += ` (${apt.assignedTo.teamMemberships[0].team.name})`;
            }

            timeline.push({
                id: `apt_${apt.id}`,
                sourceType: 'ACTIVITY',
                type: 'MEETING',
                title: apt.title || 'Planlanan',
                content: apt.description,
                date: apt.createdAt || apt.startTime, // Fallback to startTime if createdAt missing
                dueDate: apt.startTime,
                isCompleted: apt.status === 'COMPLETED',
                labelName,
                assignedToName: apt.assignedTo?.name,
                raw: apt
            });
        });

        // Planlanan/gelecek aktiviteleri en üste, geçmişi aşağıya koy
        const now = new Date();
        const planned = [];
        const past = [];

        timeline.forEach(item => {
            const hasFutureDate = item.dueDate && new Date(item.dueDate) > now && !item.isCompleted;
            item.isPlanned = !!hasFutureDate;
            if (hasFutureDate) {
                planned.push(item);
            } else {
                past.push(item);
            }
        });

        // Planlananlar: yakın tarih en üstte (ascending)
        planned.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
        // Geçmiş: en yeni en üstte (descending)
        past.sort((a, b) => new Date(b.date) - new Date(a.date));

        res.json({ planned, past });
    } catch (error) {
        console.error('Get Timeline Error:', error);
        res.status(500).json({ error: 'Aktivite geçmişi alınırken bir hata oluştu.' });
    }
};
