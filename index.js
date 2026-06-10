const { Client, LocalAuth } = require('whatsapp-web.js');
const TelegramBot = require('node-telegram-bot-api');
const qrcode = require('qrcode-terminal');

// ===== الإعدادات =====
const TELEGRAM_TOKEN = '8940409345:AAFg6X8DwF4vV1oqWTSQWiYP5AdQkQFKJYY';
const TELEGRAM_CHAT_ID = '6449354618';
// =====================

// بوت واحد بس بـ polling
const telegram = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

const messageCache = new Map();
const messageCount = new Map();
const contactLastSeen = new Map();

function getTime(timestamp) {
    return new Date((timestamp || Date.now() / 1000) * 1000)
        .toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' });
}

async function sendSafe(text, opts = {}) {
    try {
        await telegram.sendMessage(TELEGRAM_CHAT_ID, text, { parse_mode: 'Markdown', ...opts });
    } catch (e) {
        try { await telegram.sendMessage(TELEGRAM_CHAT_ID, text.replace(/[*_`]/g, '')); } catch(e2) {}
    }
}

// ===== واتساب =====
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
    await sendSafe('✅ *البوت شغال!* كل الميزات فعّالة 🎉');
});

// احفظ كل رسالة
waClient.on('message', async (msg) => {
    try {
        const contact = await msg.getContact();
        const chat = await msg.getChat();
        const senderName = contact?.pushname || contact?.number || 'مجهول';
        const chatName = chat?.isGroup ? chat.name : senderName;

        // View Once
        if (msg.isViewOnce) {
            try {
                const media = await msg.downloadMedia();
                if (media) {
                    const buffer = Buffer.from(media.data, 'base64');
                    const caption = `👁️ *صورة View Once!*\n👤 *من:* ${senderName}\n🕐 ${getTime(msg.timestamp)}`;
                    if (msg.type === 'image') {
                        await telegram.sendPhoto(TELEGRAM_CHAT_ID, buffer, { caption, parse_mode: 'Markdown' });
                    } else if (msg.type === 'video') {
                        await telegram.sendVideo(TELEGRAM_CHAT_ID, buffer, { caption, parse_mode: 'Markdown' });
                    }
                }
            } catch (e) { console.log('View Once error:', e.message); }
            return;
        }

        // ستاتس
        if (msg.isStatus) {
            await sendSafe(`📸 *${senderName}* نشر ستاتس جديد!\n🕐 ${getTime(msg.timestamp)}`);
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
            return;
        }

        // إحصاء
        const phone = contact?.number || msg.from;
        messageCount.set(phone, (messageCount.get(phone) || 0) + 1);

        // أول رسالة اليوم
        const today = new Date().toDateString();
        if (!msg.fromMe && contactLastSeen.get(phone) !== today) {
            contactLastSeen.set(phone, today);
            await sendSafe(`👋 *${senderName}* بعتلك رسالة أول مرة النهارده!`);
        }

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

// رسايل متمسحة
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

        let msg = `🚨 *رسالة اتمسحت!*\n\n👤 *من:* ${senderName}\n💬 *المحادثة:* ${chatName}\n🕐 *الوقت:* ${time}\n━━━━━━━━━━━━━━\n`;

        if (msgType === 'chat' || msgType === 'text' || (!media && msgBody)) {
            await sendSafe(msg + `📝 *الرسالة:*\n${msgBody || '(فاضية)'}`);
        } else if (msgType === 'image') {
            if (media) {
                await telegram.sendPhoto(TELEGRAM_CHAT_ID, Buffer.from(media.data, 'base64'), { caption: msg + '🖼️ صورة', parse_mode: 'Markdown' });
            } else await sendSafe(msg + '🖼️ *صورة* _(اتمسحت بسرعة)_');
        } else if (msgType === 'video') {
            if (media) {
                await telegram.sendVideo(TELEGRAM_CHAT_ID, Buffer.from(media.data, 'base64'), { caption: msg + '🎥 فيديو', parse_mode: 'Markdown' });
            } else await sendSafe(msg + '🎥 *فيديو* _(اتمسح بسرعة)_');
        } else if (msgType === 'ptt' || msgType === 'audio') {
            if (media) {
                await telegram.sendVoice(TELEGRAM_CHAT_ID, Buffer.from(media.data, 'base64'), { caption: msg + '🎵 صوت', parse_mode: 'Markdown' });
            } else await sendSafe(msg + '🎵 *رسالة صوتية* _(اتمسحت بسرعة)_');
        } else if (msgType === 'sticker') {
            if (media) {
                await telegram.sendSticker(TELEGRAM_CHAT_ID, Buffer.from(media.data, 'base64'));
                await sendSafe(msg + '🎭 ستيكر');
            } else await sendSafe(msg + '🎭 *ستيكر* _(اتمسح بسرعة)_');
        } else if (msgType === 'document') {
            if (media) {
                await telegram.sendDocument(TELEGRAM_CHAT_ID, Buffer.from(media.data, 'base64'), { caption: msg + '📎 ملف', parse_mode: 'Markdown' });
            } else await sendSafe(msg + '📎 *ملف*');
        } else {
            await sendSafe(msg + `❓ نوع: ${msgType}\n${msgBody}`);
        }

    } catch (err) { console.error('revoke error:', err.message); }
});

// جروب
waClient.on('group_join', async (n) => {
    try { const c = await n.getChat(); await sendSafe(`➕ *انضممت لجروب!*\n👥 ${c.name}`); } catch(e) {}
});
waClient.on('group_leave', async (n) => {
    try { const c = await n.getChat(); await sendSafe(`➖ *شخص غادر الجروب*\n👥 ${c.name}`); } catch(e) {}
});

// مكالمات
waClient.on('call', async (call) => {
    try {
        const contact = await waClient.getContactById(call.from);
        const name = contact?.pushname || call.from;
        const type = call.isVideo ? '📹 فيديو' : '📞 صوتية';
        await sendSafe(`${type} *واردة من ${name}!*\n🕐 ${getTime()}`);
        await call.reject();
    } catch(e) {}
});

waClient.on('disconnected', async (reason) => {
    await sendSafe(`⚠️ *واتساب انفصل!*\nالسبب: ${reason}`);
});

// أوامر تيليجرام
telegram.on('message', async (msg) => {
    if (msg.chat.id.toString() !== TELEGRAM_CHAT_ID) return;
    const text = msg.text || '';

    if (text === '/stats') {
        let stats = '📊 *إحصائيات الرسايل:*\n\n';
        if (messageCount.size === 0) {
            stats += 'مفيش رسايل لحد دلوقتي';
        } else {
            [...messageCount.entries()].sort((a,b) => b[1]-a[1]).slice(0,10)
                .forEach(([p,c],i) => { stats += `${i+1}. ${p}: ${c} رسالة\n`; });
        }
        await sendSafe(stats);
    }
    if (text === '/clear') { messageCache.clear(); messageCount.clear(); await sendSafe('🗑️ تم مسح الكاش!'); }
    if (text === '/status') {
        const state = await waClient.getState().catch(() => 'غير معروف');
        await sendSafe(`🤖 *حالة البوت:*\n✅ شغال\n📱 واتساب: ${state}\n💾 كاش: ${messageCache.size} رسالة`);
    }
    if (text === '/help') {
        await sendSafe(`📋 *الأوامر:*\n/stats - إحصائيات\n/status - الحالة\n/clear - مسح الكاش\n/help - المساعدة`);
    }
});

console.log('🚀 البوت بيشتغل...');
waClient.initialize();