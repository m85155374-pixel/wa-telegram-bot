const { Client, LocalAuth } = require('whatsapp-web.js');
const TelegramBot = require('node-telegram-bot-api');
const qrcode = require('qrcode-terminal');

// ===== الإعدادات =====
const TELEGRAM_TOKEN = '8940409345:AAFg6X8DwF4vV1oqWTSQWiYP5AdQkQFKJYY';  // ← حط التوكن بتاعك هنا
const TELEGRAM_CHAT_ID = '6449354618';
// =====================

const telegram = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

// كاش لحفظ الرسايل قبل ما تتمسح
const messageCache = new Map();

const waClient = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
        ]
    }
});

waClient.on('qr', (qr) => {
    console.log('\n📱 امسح الـ QR code ده بواتساب:\n');
    qrcode.generate(qr, { small: true });
});

waClient.on('ready', () => {
    console.log('✅ واتساب اتوصل بنجاح!');
    telegram.sendMessage(TELEGRAM_CHAT_ID, '✅ البوت شغال! هيبعتلك الرسايل المحذوفة 🎉');
});

// احفظ كل رسالة جديدة في الكاش + ابعت View Once فوراً
waClient.on('message', async (msg) => {
    try {
        // View Once - ابعتها فوراً قبل ما تتمسح
        if (msg.isViewOnce) {
            try {
                const media = await msg.downloadMedia();
                if (media) {
                    const contact = await msg.getContact();
                    const senderName = contact?.pushname || contact?.number || 'مجهول';
                    const buffer = Buffer.from(media.data, 'base64');
                    const caption = `👁️ *صورة View Once!*\n👤 *من:* ${senderName}`;
                    if (msg.type === 'image') {
                        await telegram.sendPhoto(TELEGRAM_CHAT_ID, buffer, { caption, parse_mode: 'Markdown' });
                    } else if (msg.type === 'video') {
                        await telegram.sendVideo(TELEGRAM_CHAT_ID, buffer, { caption, parse_mode: 'Markdown' });
                    }
                    console.log('✅ تم إرسال View Once من:', senderName);
                }
            } catch (e) {
                console.log('خطأ في View Once:', e.message);
            }
            return;
        }

        // حفظ الرسالة في الكاش
        const cached = {
            body: msg.body,
            type: msg.type,
            from: msg.from,
            timestamp: msg.timestamp,
            media: null,
            senderName: '',
            chatName: ''
        };

        // احفظ اسم المرسل والمحادثة
        try {
            const contact = await msg.getContact();
            const chat = await msg.getChat();
            cached.senderName = contact?.pushname || contact?.number || 'مجهول';
            cached.chatName = chat?.isGroup ? chat.name : cached.senderName;
        } catch (e) {}

        // حمّل الميديا فوراً
        if (['image', 'video', 'audio', 'ptt', 'sticker', 'document'].includes(msg.type)) {
            try {
                const media = await msg.downloadMedia();
                if (media) cached.media = media;
            } catch (e) {
                console.log('مش قادر يحمل الميديا:', e.message);
            }
        }

        messageCache.set(msg.id._serialized, cached);

        // امسح من الكاش بعد 10 دقايق
        setTimeout(() => {
            messageCache.delete(msg.id._serialized);
        }, 10 * 60 * 1000);

    } catch (err) {
        console.error('خطأ في حفظ الرسالة:', err.message);
    }
});

// لما رسالة تتمسح
waClient.on('message_revoke_everyone', async (after, before) => {
    try {
        if (!before) return;

        const cachedMsg = messageCache.get(before.id._serialized);
        
        const senderName = cachedMsg?.senderName || 'مجهول';
        const chatName = cachedMsg?.chatName || 'مجهول';
        const msgType = cachedMsg?.type || before.type || 'unknown';
        const msgBody = cachedMsg?.body || before.body || '';
        const media = cachedMsg?.media || null;
        const time = new Date((cachedMsg?.timestamp || before.timestamp || Date.now() / 1000) * 1000)
            .toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' });

        let message = `🚨 *رسالة اتمسحت!*\n\n`;
        message += `👤 *من:* ${senderName}\n`;
        message += `💬 *المحادثة:* ${chatName}\n`;
        message += `🕐 *الوقت:* ${time}\n`;
        message += `━━━━━━━━━━━━━━\n`;

        // نص
        if (msgType === 'chat' || msgType === 'text' || (msgBody && !media)) {
            message += `📝 *الرسالة:*\n${msgBody || '(نص فاضي)'}`;
            await telegram.sendMessage(TELEGRAM_CHAT_ID, message, { parse_mode: 'Markdown' });
        }

        // صورة
        else if (msgType === 'image') {
            message += `🖼️ *نوع الرسالة:* صورة`;
            if (media) {
                const buffer = Buffer.from(media.data, 'base64');
                await telegram.sendPhoto(TELEGRAM_CHAT_ID, buffer, { caption: message, parse_mode: 'Markdown' });
            } else {
                await telegram.sendMessage(TELEGRAM_CHAT_ID, message + '\n_(الصورة اتمسحت بسرعة)_', { parse_mode: 'Markdown' });
            }
        }

        // فيديو
        else if (msgType === 'video') {
            message += `🎥 *نوع الرسالة:* فيديو`;
            if (media) {
                const buffer = Buffer.from(media.data, 'base64');
                await telegram.sendVideo(TELEGRAM_CHAT_ID, buffer, { caption: message, parse_mode: 'Markdown' });
            } else {
                await telegram.sendMessage(TELEGRAM_CHAT_ID, message + '\n_(الفيديو اتمسح بسرعة)_', { parse_mode: 'Markdown' });
            }
        }

        // صوت / رسالة صوتية
        else if (msgType === 'audio' || msgType === 'ptt') {
            message += `🎵 *نوع الرسالة:* رسالة صوتية`;
            if (media) {
                const buffer = Buffer.from(media.data, 'base64');
                await telegram.sendVoice(TELEGRAM_CHAT_ID, buffer, { caption: message, parse_mode: 'Markdown' });
            } else {
                await telegram.sendMessage(TELEGRAM_CHAT_ID, message + '\n_(الصوت اتمسح بسرعة)_', { parse_mode: 'Markdown' });
            }
        }

        // ستيكر
        else if (msgType === 'sticker') {
            message += `🎭 *نوع الرسالة:* ستيكر`;
            if (media) {
                const buffer = Buffer.from(media.data, 'base64');
                await telegram.sendSticker(TELEGRAM_CHAT_ID, buffer);
                await telegram.sendMessage(TELEGRAM_CHAT_ID, message, { parse_mode: 'Markdown' });
            } else {
                await telegram.sendMessage(TELEGRAM_CHAT_ID, message + '\n_(الستيكر اتمسح بسرعة)_', { parse_mode: 'Markdown' });
            }
        }

        // ملف
        else if (msgType === 'document') {
            message += `📎 *نوع الرسالة:* ملف`;
            if (media) {
                const buffer = Buffer.from(media.data, 'base64');
                await telegram.sendDocument(TELEGRAM_CHAT_ID, buffer, { caption: message, parse_mode: 'Markdown' });
            } else {
                await telegram.sendMessage(TELEGRAM_CHAT_ID, message, { parse_mode: 'Markdown' });
            }
        }

        else {
            message += `❓ *نوع:* ${msgType}\n${msgBody ? `📝 ${msgBody}` : ''}`;
            await telegram.sendMessage(TELEGRAM_CHAT_ID, message, { parse_mode: 'Markdown' });
        }

        console.log(`✅ تم إرسال رسالة محذوفة من: ${senderName}`);

    } catch (err) {
        console.error('❌ خطأ:', err.message);
    }
});

waClient.on('disconnected', (reason) => {
    console.log('❌ واتساب انفصل:', reason);
    telegram.sendMessage(TELEGRAM_CHAT_ID, `⚠️ واتساب انفصل!\nالسبب: ${reason}`);
});

console.log('🚀 بيشتغل... استنى الـ QR code');
waClient.initialize();