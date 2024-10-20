require('dotenv').config();
const { Telegraf } = require('telegraf');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const { exec } = require('child_process');
const {M3uParser} = require('m3u-parser-generator')


const tockenTorrent = process.env.BOT_TOKEN;
const torrServeUrl = process.env.TORRSERVE_URL;
const savePathTorrent = process.env.SAVE_PATH_TORRENT;
const savePathSteam = process.env.SAVE_PATH_STREAM;

const rcloneRemote = process.env.RCLONE_REMOTE;

if (!tockenTorrent || !torrServeUrl || !savePathTorrent || !savePathSteam || !rcloneRemote) {
    console.error('Enpty requires variables');
    process.exit(1);
}


const bot = new Telegraf(tockenTorrent);

const torrServeEndpoints = {
    upload: '/torrent/upload',
    playlist: (hash) =>  `/playlist?hash=${hash}`,
}

let waitingForFile = {};

// Команда /stream
bot.command('stream', (ctx) => {
    const chatId = ctx.chat.id;
    waitingForFile[chatId] = 'stream';
    ctx.reply('Ожидаю файл для стрима...');
});

// Команда /save
bot.command('save', (ctx) => {
    const chatId = ctx.chat.id;
    waitingForFile[chatId] = 'save';
    ctx.reply('Ожидаю файл для сохранения...');
});

// Обработчик получения файла
bot.on('document', async (ctx) => {
    try {
        const chatId = ctx.chat.id;
        const fileId = ctx.message.document.file_id;
        const fileName = ctx.message.document.file_name;
    
        if (!waitingForFile[chatId]) {
            ctx.reply('Пожалуйста, сначала введите команду /stream или /save.');
            return;
        }

        if (!fileName.endsWith(".torrent")) {
            ctx.reply('Это не торрент');
        }
    
        const filePath = waitingForFile[chatId] === 'stream' ? `${savePathSteam}/${fileName}` : `${savePathTorrent}/${fileName}`;
    
        try {
            // Получаем файл через Telegram API
            const fileLink = await ctx.telegram.getFileLink(fileId);
            const response = await axios({
                method: 'get',
                url: fileLink,
                responseType: 'stream',
            });
    
            // Сохраняем файл локально
            const writer = fs.createWriteStream(filePath);
            response.data.pipe(writer);
    
            writer.on('finish', async () => {
                ctx.reply('😊 Файл сохранен!');
    
                if (waitingForFile[chatId] === 'save') {
                    delete waitingForFile[chatId];
                    return;
                }
    
                try {
                    // Загружаем файл на API
                    const formData = new FormData();
                    formData.append('file', fs.createReadStream(filePath));
                    formData.append('title', fileName)
    
                    const respTorrServe = await axios.post(`${torrServeUrl}${torrServeEndpoints.upload}`, formData, {
                        headers: formData.getHeaders(),
                    });
    
                    const fileHash = respTorrServe.data.hash;
    
                    const torrServeData = await axios.get(`${torrServeUrl}${torrServeEndpoints.playlist(fileHash)}`);
                    const m3u = torrServeData.data.toString();
    
                    const playlist = M3uParser.parse(m3u);
    
                    if (playlist || playlist.medias.length === 0) {
                        ctx.reply(`Файл ${fileName}. Плейлист пустой`);
                    }
    
    
                    for (const item of playlist.medias) {
                        try {
                            // Выполняем команду rclone
                            exec(`rclone copyurl ${filePath} ${rcloneRemote}/${item.name}`, (error, stdout, stderr) => {
                                if (error) {
                                    ctx.reply(`${item.name} Ошибка при копировании: ${stderr}`);
                                 }
                            });
                        } catch (e) {
                            ctx.reply(`${item.name} Ошибка при копировании: ${e}`);
                        }
                    }
                    
                    ctx.reply(`Файл ${fileName} успешно загружен на API.`);
    
    
                } catch (error) {
                    ctx.reply('Ошибка при загрузке на API.');
                }
                
            });
        } catch (error) {
            ctx.reply('Ошибка при получении файла.');
        }
    } catch (e) {
        console.error(e);
    }
    
});

// Запуск бота
bot.launch();

console.log('Бот запущен');