const {Telegraf} = require("telegraf");
const fs = require("node:fs/promises")
const fsOlod = require("node:fs")
const axios = require("axios");
const path = require("path");

const bot = new Telegraf(process.env.BOT_TOKEN || "6598238593:AAE3K6Npf3yF3O2CPnhzKoO9kEzfX-K1myg");
const PATH_TO_SAVE_TORRENT = process.env.PATH_TO_SAVE_TORRENT || "/home/transmission/torrents";
const PATH_TO_SAVE_FILMS = process.env.PATH_TO_SAVE_FILMS || "/home/transmission/download";

const dowFiles = {}

async function errorDownload(chatId, name, reason) {
  await bot.telegram.sendMessage(chatId, `${name}\nreason: ${reason}`)
}

async function streamDownload(fsWriteStream, url, name, chatId) {
  dowFiles[name] = {status: "started", chatId};

  axios({
    method: 'get',
    url: url,
    responseType: 'stream',
    onDownloadProgress: (loaded, total, progress, bytes, estimated, rate, upload = true) => {
      dowFiles[name].progress = progress
      dowFiles[name].estimated = estimated
      dowFiles[name].rate = rate
      dowFiles[name].upload = upload
      dowFiles[name].status = "download"
    }
  })
    .then(function (response) {
      response.data.pipe(fsWriteStream);
      fsWriteStream.on('finish', () => {
        dowFiles[name].status = "saved"
        console.log(name, 'Saved');
      });

      fsWriteStream.on('error', (e) => {
        dowFiles[name].status = "error_save";
        errorDownload(dowFiles[name].chatId, name, e.message)
        console.error(e.message);
      });  
    })
    .catch(e => {
      dowFiles[name].status = "error_download";
      errorDownload(dowFiles[name].chatId, name, e.message)
      console.log(name, e);
    })
}

bot.on("document", async (ctx) => {
    const fileId = ctx.message.document.file_id;

    try {
        const fileLink = await ctx.telegram.getFileLink(fileId);
        const fileResponse = await axios({
            url: fileLink,
            method: "GET",
            responseType: "stream",
        });

        console.log("Save file by path", path.resolve(PATH_TO_SAVE_TORRENT,ctx.message.document.file_name))

        await fs.writeFile(`${path.resolve(PATH_TO_SAVE)}/${ctx.message.document.file_name}`, fileResponse.data);
        ctx.reply('👍');
    } catch(e) {
        ctx.reply(`ERROR:${e.message}`);
        console.log("ERROR", e)
    }
});

bot.on('message', async (ctx) => {
  JSON.stringify
  if(!ctx.update?.message?.video) return

  try {
    let name = '';
    if (ctx.update.message.caption?.length <= 50) {
      const splited = ctx.update.message.video.file_name.split('.');
      name = `${ctx.update.message.caption}.${splited.at(-1)}`;
    } else {
      name = ctx.update.message.video.file_name;
    }

    const fileId = ctx.update.message.video.file_id;
    const fileLink = await ctx.telegram.getFileLink(fileId);

    const writer = fsOlod.createWriteStream(path.resolve(PATH_TO_SAVE_FILMS, name))

    streamDownload(writer, fileLink, name, ctx.update.message.chat.id)
    ctx.reply('начало загрузки');
    ctx.reply('посмотреть статус /dow_status');
  } catch(e) {
    ctx.reply(`ERROR:${e.message}`);
    console.log("ERROR", e)
  }

})

bot.command('dow_status', async (ctx) => {
  dow = []
  for(const [key, value] of Object.values(dowFiles)) {
    const statusString = `${key}:\n`;
    for(const [key1, value1] of Object.values(value)) {
      statusString = `${key1}:${value1}\n`;
    }
    dow.push(statusString);
  }
  ctx.reply(dow.join('\n=============\n'));
})

bot.launch(() => {
  console.log("Bot started");
})

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))