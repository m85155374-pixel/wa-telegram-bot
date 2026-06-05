const { Client, LocalAuth } = require('whatsapp-web.js');
const TelegramBot = require('node-telegram-bot-api');
const qrcode = require('qrcode-terminal');

// ===== الإعدادات =====
const TELEGRAM_TOKEN = '8940409345:AAFg6X8DwF4vV1oqWTSQWiYP5AdQkQFKJYY';  // ← حط التوكن بتاعك هنا
const TELEGRAM_CHAT_ID = '6449354618'; // ← الـ Chat ID بتاعك
// =====================

const telegram = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

const waClient = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
        ]
    }
});

// لما يجيب QR code للتسجيل
waClient.on('qr', (qr) => {
    console.log('\n📱 امسح الـ QR code ده بواتساب:\n');
    qrcode.generate(qr, { small: true });
});

// لما يتوصل
waClient.on('ready', () => {
    console.log('✅ واتساب اتوصل بنجاح!');
    telegram.sendMessage(TELEGRAM_CHAT_ID, '✅ البوت شغال! هيبعتلك الرسايل المحذوفة 🎉');
});

// لما رسالة تتمسح
waClient.on('message_revoke_everyone', async (after, before) => {
    try {
        if (!before) return; // مفيش محتوى قبل المسح

        const contact = await before.getContact();
        const chat = await before.getChat();

        const senderName = contact.pushname || contact.number || 'مجهول';
        const chatName = chat.isGroup ? chat.name : senderName;
        const time = new Date(before.timestamp * 1000).toLocaleString('ar-EG', {
            timeZone: 'Africa/Cairo'
        });

        let message = `🚨 *رسالة اتمسحت!*\n\n`;
        message += `👤 *من:* ${senderName}\n`;
        message += `💬 *المحادثة:* ${chatName}\n`;
        message += `🕐 *الوقت:* ${time}\n`;
        message += `━━━━━━━━━━━━━━\n`;

        // نص
        if (before.body) {
            message += `📝 *الرسالة:*\n${before.body}`;
            await telegram.sendMessage(TELEGRAM_CHAT_ID, message, { parse_mode: 'Markdown' });
        }

        // صورة
        else if (before.type === 'image') {
            message += `🖼️ *نوع الرسالة:* صورة`;
            try {
                const media = await before.downloadMedia();
                if (media) {
                    const buffer = Buffer.from(media.data, 'base64');
                    await telegram.sendPhoto(TELEGRAM_CHAT_ID, buffer, {
                        caption: message,
                        parse_mode: 'Markdown'
                    });
                } else {
                    await telegram.sendMessage(TELEGRAM_CHAT_ID, message + '\n_(مش قادر يحمل الصورة)_', { parse_mode: 'Markdown' });
                }
            } catch {
                await telegram.sendMessage(TELEGRAM_CHAT_ID, message + '\n_(مش قادر يحمل الصورة)_', { parse_mode: 'Markdown' });
            }
        }

        // فيديو
        else if (before.type === 'video') {
            message += `🎥 *نوع الرسالة:* فيديو`;
            await telegram.sendMessage(TELEGRAM_CHAT_ID, message, { parse_mode: 'Markdown' });
        }

        // صوت
        else if (before.type === 'audio' || before.type === 'ptt') {
            message += `🎵 *نوع الرسالة:* رسالة صوتية`;
            await telegram.sendMessage(TELEGRAM_CHAT_ID, message, { parse_mode: 'Markdown' });
        }

        // ملف
        else if (before.type === 'document') {
            message += `📎 *نوع الرسالة:* ملف`;
            await telegram.sendMessage(TELEGRAM_CHAT_ID, message, { parse_mode: 'Markdown' });
        }

        // غير كده
        else {
            message += `❓ *نوع الرسالة:* ${before.type}`;
            await telegram.sendMessage(TELEGRAM_CHAT_ID, message, { parse_mode: 'Markdown' });
        }

        console.log(`✅ تم إرسال رسالة محذوفة من: ${senderName}`);

    } catch (err) {
        console.error('❌ خطأ:', err.message);
    }
});

// لو الاتصال انقطع
waClient.on('disconnected', (reason) => {
    console.log('❌ واتساب انفصل:', reason);
    telegram.sendMessage(TELEGRAM_CHAT_ID, `⚠️ واتساب انفصل!\nالسبب: ${reason}`);
});

// شغّل البوت
console.log('🚀 بيشتغل... استنى الـ QR code');
waClient.initialize();
