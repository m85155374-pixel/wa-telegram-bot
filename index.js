const { Client, LocalAuth } = require('whatsapp-web.js');
const TelegramBot = require('node-telegram-bot-api');
const qrcode = require('qrcode-terminal');

// ===== الإعدادات =====
const TELEGRAM_TOKEN = '8940409345:AAFg6X8DwF4vV1oqWTSQWiYP5AdQkQFKJYY';  // ← حط التوكن بتاعك هنا
const TELEGRAM_CHAT_ID = '6449354618';
// =====================

const telegram = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
const messageCache = new Map();
const contactLastSeen = new Map();
const messageCount = new Map();
const groupActivity = new Map();

// ===== دوال مساعدة =====
function getTime(timestamp) {
    return new Date((timestamp || Date.now() / 1000) * 1000)
        .toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' });
}

async function sendSafe(chatId, text, opts = {}) {
    try {
        await telegram.sendMessage(chatId, text, { parse_mode: 'Markdown', ...opts });
    } catch (e) {
        await telegram.sendMessage(chatId, text.replace(/[*_`]/g, ''));
    }
}

// ===== تشغيل البوت =====
const waClient = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    }
});

waClient.on('qr', (qr) => {
    console.log('\n📱 امسح الـ QR code:\n');
    qrcode.generate(qr, { small: true });
});

waClient.on('ready', async () => {
    console.log('✅ واتساب اتوصل!');
    await sendSafe(TELEGRAM_CHAT_ID, '✅ *البوت شغال!* كل الميزات فعّالة 🎉');
});

// ===== 1. حفظ كل رسالة + View Once =====
waClient.on('message', async (msg) => {
    try {
        const contact = await msg.getContact();
        const chat = await msg.getChat();
        const senderName = contact?.pushname || contact?.number || 'مجهول';
        const chatName = chat?.isGroup ? chat.name : senderName;

        // ميزة 1: View Once - صور ومقاطع تتشاف مرة واحدة
        if (msg.isViewOnce) {
            try {
                const media = await msg.downloadMedia();
                if (media) {
                    const buffer = Buffer.from(media.data, 'base64');
                    const caption = `👁️ *صورة View Once!*\n👤 *من:* ${senderName}\n💬 *المحادثة:* ${chatName}\n🕐 *الوقت:* ${getTime(msg.timestamp)}`;
                    if (msg.type === 'image') {
                        await telegram.sendPhoto(TELEGRAM_CHAT_ID, buffer, { caption, parse_mode: 'Markdown' });
                    } else if (msg.type === 'video') {
                        await telegram.sendVideo(TELEGRAM_CHAT_ID, buffer, { caption, parse_mode: 'Markdown' });
                    }
                }
            } catch (e) { console.log('View Once error:', e.message); }
            return;
        }

        // ميزة 2: إحصاء رسايل كل شخص
        const phone = contact?.number || msg.from;
        messageCount.set(phone, (messageCount.get(phone) || 0) + 1);

        // حفظ في الكاش
        const cached = { body: msg.body, type: msg.type, timestamp: msg.timestamp, senderName, chatName, media: null };

        if (['image', 'video', 'audio', 'ptt', 'sticker', 'document'].includes(msg.type)) {
            try {
                const media = await msg.downloadMedia();
                if (media) cached.media = media;
            } catch (e) {}
        }

        messageCache.set(msg.id._serialized, cached);
        setTimeout(() => messageCache.delete(msg.id._serialized), 15 * 60 * 1000);

    } catch (err) { console.error('message error:', err.message); }
});

// ===== 2. رسايل متمسحة =====
waClient.on('message_revoke_everyone', async (after, before) => {
    try {
        if (!before) return;
        const cached = messageCache.get(before.id._serialized);
        const senderName = cached?.senderName || 'مجهول';
        const chatName = cached?.chatName || 'مجهول';
        const msgType = cached?.type || before.type || 'unknown';
        const msgBody = cached?.body || before.body || '';
        const media = cached?.media || null;
        const time = getTime(cached?.timestamp || before.timestamp);

        let message = `🚨 *رسالة اتمسحت!*\n\n👤 *من:* ${senderName}\n💬 *المحادثة:* ${chatName}\n🕐 *الوقت:* ${time}\n━━━━━━━━━━━━━━\n`;

        if (msgType === 'chat' || (!media && msgBody)) {
            await sendSafe(TELEGRAM_CHAT_ID, message + `📝 *الرسالة:*\n${msgBody || '(فاضية)'}`);
        } else if (msgType === 'image') {
            if (media) {
                await telegram.sendPhoto(TELEGRAM_CHAT_ID, Buffer.from(media.data, 'base64'), { caption: message + '🖼️ صورة', parse_mode: 'Markdown' });
            } else await sendSafe(TELEGRAM_CHAT_ID, message + '🖼️ *صورة* _(اتمسحت بسرعة)_');
        } else if (msgType === 'video') {
            if (media) {
                await telegram.sendVideo(TELEGRAM_CHAT_ID, Buffer.from(media.data, 'base64'), { caption: message + '🎥 فيديو', parse_mode: 'Markdown' });
            } else await sendSafe(TELEGRAM_CHAT_ID, message + '🎥 *فيديو* _(اتمسح بسرعة)_');
        } else if (msgType === 'ptt' || msgType === 'audio') {
            if (media) {
                await telegram.sendVoice(TELEGRAM_CHAT_ID, Buffer.from(media.data, 'base64'), { caption: message + '🎵 صوت', parse_mode: 'Markdown' });
            } else await sendSafe(TELEGRAM_CHAT_ID, message + '🎵 *رسالة صوتية* _(اتمسحت بسرعة)_');
        } else if (msgType === 'sticker') {
            if (media) {
                await telegram.sendSticker(TELEGRAM_CHAT_ID, Buffer.from(media.data, 'base64'));
                await sendSafe(TELEGRAM_CHAT_ID, message + '🎭 ستيكر');
            } else await sendSafe(TELEGRAM_CHAT_ID, message + '🎭 *ستيكر* _(اتمسح بسرعة)_');
        } else if (msgType === 'document') {
            if (media) {
                await telegram.sendDocument(TELEGRAM_CHAT_ID, Buffer.from(media.data, 'base64'), { caption: message + '📎 ملف', parse_mode: 'Markdown' });
            } else await sendSafe(TELEGRAM_CHAT_ID, message + '📎 *ملف*');
        } else {
            await sendSafe(TELEGRAM_CHAT_ID, message + `❓ نوع: ${msgType}\n${msgBody}`);
        }

    } catch (err) { console.error('revoke error:', err.message); }
});

// ===== 3. إشعار لما حد يكتب =====
waClient.on('message', async (msg) => {
    // ميزة 3: لو حد بعت رسالة أول مرة النهارده
    try {
        const contact = await msg.getContact();
        const phone = contact?.number || msg.from;
        const today = new Date().toDateString();
        const lastDate = contactLastSeen.get(phone);
        
        if (lastDate !== today) {
            contactLastSeen.set(phone, today);
            const senderName = contact?.pushname || phone;
            if (msg.fromMe === false) {
                await sendSafe(TELEGRAM_CHAT_ID, `👋 *${senderName}* بعتلك رسالة أول مرة النهارده!`);
            }
        }
    } catch(e) {}
});

// ===== 4. إشعار انضمام لجروب =====
waClient.on('group_join', async (notification) => {
    try {
        const chat = await notification.getChat();
        await sendSafe(TELEGRAM_CHAT_ID, `➕ *انضممت لجروب جديد!*\n👥 *اسم الجروب:* ${chat.name}\n🕐 *الوقت:* ${getTime()}`);
    } catch(e) {}
});

// ===== 5. إشعار مغادرة جروب =====
waClient.on('group_leave', async (notification) => {
    try {
        const chat = await notification.getChat();
        await sendSafe(TELEGRAM_CHAT_ID, `➖ *شخص غادر الجروب*\n👥 *الجروب:* ${chat.name}\n🕐 *الوقت:* ${getTime()}`);
    } catch(e) {}
});

// ===== 6. إشعار تغيير اسم الجروب =====
waClient.on('group_update', async (notification) => {
    try {
        const chat = await notification.getChat();
        if (notification.type === 'subject') {
            await sendSafe(TELEGRAM_CHAT_ID, `✏️ *اسم الجروب اتغير!*\n👥 *الجروب:* ${chat.name}\n🕐 *الوقت:* ${getTime()}`);
        }
    } catch(e) {}
});

// ===== 7. إشعار الحالة (Status) =====
waClient.on('message', async (msg) => {
    try {
        if (msg.isStatus) {
            const contact = await msg.getContact();
            const senderName = contact?.pushname || contact?.number || 'مجهول';
            let statusMsg = `📸 *${senderName}* نشر ستاتس جديد!\n🕐 ${getTime(msg.timestamp)}`;
            
            if (msg.type === 'image' && msg.body) {
                statusMsg += `\n📝 ${msg.body}`;
            }
            
            await sendSafe(TELEGRAM_CHAT_ID, statusMsg);

            // ميزة 8: حفظ الستاتس كصورة
            if (['image', 'video'].includes(msg.type)) {
                try {
                    const media = await msg.downloadMedia();
                    if (media) {
                        const buffer = Buffer.from(media.data, 'base64');
                        if (msg.type === 'image') {
                            await telegram.sendPhoto(TELEGRAM_CHAT_ID, buffer, { caption: `📸 ستاتس ${senderName}` });
                        } else {
                            await telegram.sendVideo(TELEGRAM_CHAT_ID, buffer, { caption: `🎥 ستاتس ${senderName}` });
                        }
                    }
                } catch(e) {}
            }
        }
    } catch(e) {}
});

// ===== 9. إشعار الاتصالات الواردة =====
waClient.on('call', async (call) => {
    try {
        const contact = await waClient.getContactById(call.from);
        const callerName = contact?.pushname || call.from;
        const callType = call.isVideo ? '📹 مكالمة فيديو' : '📞 مكالمة صوتية';
        await sendSafe(TELEGRAM_CHAT_ID, `${callType} *واردة!*\n👤 *من:* ${callerName}\n🕐 *الوقت:* ${getTime()}`);
        await call.reject();
    } catch(e) {}
});

// ===== 10. إشعار الانفصال وإعادة الاتصال =====
waClient.on('disconnected', async (reason) => {
    console.log('❌ انفصل:', reason);
    await sendSafe(TELEGRAM_CHAT_ID, `⚠️ *واتساب انفصل!*\nالسبب: ${reason}\n🔄 بيحاول يتوصل تاني...`);
});

waClient.on('auth_failure', async () => {
    await sendSafe(TELEGRAM_CHAT_ID, '❌ *فشل التحقق!* محتاج تمسح QR code تاني.');
});

// ===== 11. إشعار لما حد يغير رقمه =====
waClient.on('contact_changed', async (message, oldId, newId, isContact) => {
    try {
        await sendSafe(TELEGRAM_CHAT_ID, `🔄 *شخص غير رقمه!*\n📞 القديم: ${oldId}\n📞 الجديد: ${newId}`);
    } catch(e) {}
});

// ===== 12. أوامر البوت عبر تيليجرام =====
const telegramBot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

telegramBot.on('message', async (msg) => {
    if (msg.chat.id.toString() !== TELEGRAM_CHAT_ID) return;
    const text = msg.text || '';

    // أمر: عرض الإحصائيات
    if (text === '/stats') {
        let stats = '📊 *إحصائيات الرسايل:*\n\n';
        if (messageCount.size === 0) {
            stats += 'مفيش رسايل لحد دلوقتي';
        } else {
            const sorted = [...messageCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
            sorted.forEach(([phone, count], i) => {
                stats += `${i + 1}. ${phone}: ${count} رسالة\n`;
            });
        }
        await sendSafe(TELEGRAM_CHAT_ID, stats);
    }

    // أمر: مسح الكاش
    if (text === '/clear') {
        messageCache.clear();
        messageCount.clear();
        await sendSafe(TELEGRAM_CHAT_ID, '🗑️ تم مسح الكاش!');
    }

    // أمر: حالة البوت
    if (text === '/status') {
        const state = await waClient.getState();
        await sendSafe(TELEGRAM_CHAT_ID, `🤖 *حالة البوت:*\n✅ شغال\n📱 واتساب: ${state}\n💾 رسايل في الكاش: ${messageCache.size}`);
    }

    // أمر: المساعدة
    if (text === '/help') {
        await sendSafe(TELEGRAM_CHAT_ID, `📋 *الأوامر المتاحة:*\n\n/stats - إحصائيات الرسايل\n/status - حالة البوت\n/clear - مسح الكاش\n/help - المساعدة`);
    }
});

console.log('🚀 البوت بيشتغل...');
waClient.initialize();