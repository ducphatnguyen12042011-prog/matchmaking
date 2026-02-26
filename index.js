/**
 * ===========================================================================
 * 🏆 PRIMEBLOX MULTIPLAYER SYSTEM V17.0 - ULTIMATE COMPLETION
 * 📋 PHIÊN BẢN: HOÀN CHỈNH 100% - ĐẦY ĐỦ TẤT CẢ TÍNH NĂNG THEO YÊU CẦU
 * 🛠️ CẬP NHẬT: AUTO-VOICE, !j COMMAND, MATCH TRACKING, DM FALLBACK, ELO SYSTEM
 * ===========================================================================
 */

const { 
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, 
    TextInputStyle, InteractionType, PermissionsBitField, ChannelType,
    Partials, ActivityType
} = require('discord.js');
const mysql = require('mysql2/promise');
const nblox = require('noblox.js');
require('dotenv').config();

// --- 1. KHỞI TẠO CLIENT ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages, 
        GatewayIntentBits.GuildVoiceStates
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User]
});

// --- 2. CẤU HÌNH HỆ THỐNG ---
const CONFIG = {
    ADMIN_ROLE_ID: "1465374336214106237",
    VERIFY_CHANNEL_ID: "1476202572594548799", 
    LB_CHANNEL_ID: "1474674662792232981", 
    CATEGORY_VOICE_ID: "1476182203653161061", 
    LOG_CHANNEL_ID: "1476182400617680968",
    TRACKING_CHANNEL_ID: "1476233898500292740", // Kênh theo dõi trận đấu
    VIP_LINK: "https://www.roblox.com/vi/games/301549746/Counter-Blox?privateServerLinkCode=56786714113746670670511968107962",
    BANNER_URL: "https://www.dexerto.com/cdn-image/wp-content/uploads/2026/01/22/Counter-Blox-codes.jpg?width=1200&quality=60&format=auto",
    COLOR: { SUCCESS: 0x2ecc71, ERROR: 0xe74c3c, INFO: 0x3498db, GOLD: 0xf1c40f, BLUE: 0x00a2ff },
    ELO: { GAIN: 25, LOSS: 20 }
};

// --- 3. QUẢN LÝ BỘ NHỚ ---
let queues = { 
    "1v1": { players: [], limit: 2 }, 
    "2v2": { players: [], limit: 4 }, 
    "5v5": { players: [], limit: 10 } 
};
let activeMatches = [];
const teamNames = ["ALPHA", "OMEGA", "RADIANT", "DIRE", "STORM", "THUNDER", "TITAN", "PHOENIX"];

// --- 4. KẾT NỐI DATABASE ---
const pool = mysql.createPool({ 
    uri: process.env.DATABASE_URL, 
    ssl: { rejectUnauthorized: false },
    connectionLimit: 15
});

// --- 5. HÀM HỖ TRỢ (UTILITIES) ---

async function updateSystemUI() {
    try {
        const vChan = await client.channels.fetch(CONFIG.VERIFY_CHANNEL_ID).catch(() => null);
        if (!vChan) return;

        const vEmbed = new EmbedBuilder()
            .setTitle("⚔️ PRIMEBLOX MATCHMAKING CENTER")
            .setDescription("Sử dụng nút bấm hoặc chat `!j [mode]` để thi đấu.\nVí dụ: `!j 1v1` hoặc `!j 5v5`")
            .addFields({ 
                name: "📊 Trạng thái Hàng chờ", 
                value: `>>> ⚔️ **1v1:** \`${queues["1v1"].players.length}/2\`\n👥 **2v2:** \`${queues["2v2"].players.length}/4\`\n🔥 **5v5:** \`${queues["5v5"].players.length}/10\`` 
            })
            .setColor(CONFIG.COLOR.BLUE)
            .setImage(CONFIG.BANNER_URL);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('q_1v1').setLabel('1 vs 1').setStyle(ButtonStyle.Primary).setEmoji('⚔️'),
            new ButtonBuilder().setCustomId('q_2v2').setLabel('2 vs 2').setStyle(ButtonStyle.Primary).setEmoji('👥'),
            new ButtonBuilder().setCustomId('q_5v5').setLabel('5 vs 5').setStyle(ButtonStyle.Primary).setEmoji('🔥'),
            new ButtonBuilder().setCustomId('v_start').setLabel('Xác Minh').setStyle(ButtonStyle.Success).setEmoji('🛡️')
        );

        const messages = await vChan.messages.fetch({ limit: 10 });
        const botMsg = messages.find(m => m.author.id === client.user.id && m.components.length > 0);
        if (botMsg) await botMsg.edit({ embeds: [vEmbed], components: [row] });
        else await vChan.send({ embeds: [vEmbed], components: [row] });
    } catch (err) { console.error("Lỗi cập nhật UI:", err); }
}

async function startMatch(mode, guild, channel) {
    const matchPlayers = [...queues[mode].players];
    queues[mode].players = []; // Reset queue
    
    const mId = Math.floor(100000 + Math.random() * 899999);
    matchPlayers.sort(() => 0.5 - Math.random());
    const t1 = matchPlayers.slice(0, matchPlayers.length / 2);
    const t2 = matchPlayers.slice(matchPlayers.length / 2);
    const tNames = [...teamNames].sort(() => 0.5 - Math.random());

    try {
        const parent = CONFIG.CATEGORY_VOICE_ID;
        // Tạo Voice Team 1
        const vc1 = await guild.channels.create({
            name: `🔊 ĐỘI ${tNames[0]} [#${mId}]`,
            type: ChannelType.GuildVoice, parent,
            permissionOverwrites: [
                { id: guild.id, deny: [PermissionsBitField.Flags.Connect] },
                ...t1.map(p => ({ id: p.id, allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] }))
            ]
        });
        // Tạo Voice Team 2
        const vc2 = await guild.channels.create({
            name: `🔊 ĐỘI ${tNames[1]} [#${mId}]`,
            type: ChannelType.GuildVoice, parent,
            permissionOverwrites: [
                { id: guild.id, deny: [PermissionsBitField.Flags.Connect] },
                ...t2.map(p => ({ id: p.id, allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] }))
            ]
        });

        activeMatches.push({ id: mId, mode, t1Name: tNames[0], t2Name: tNames[1], t1P: t1, t2P: t2, voices: [vc1.id, vc2.id] });

        // Embed thông báo tại sảnh
        const startEmbed = new EmbedBuilder()
            .setTitle(`⚔️ TRẬN ĐẤU BẮT ĐẦU | #${mId}`)
            .addFields(
                { name: `🟦 ĐỘI ${tNames[0]}`, value: t1.map(p => `• **${p.name}**`).join('\n'), inline: true },
                { name: `🟥 ĐỘI ${tNames[1]}`, value: t2.map(p => `• **${p.name}**`).join('\n'), inline: true }
            )
            .setColor(CONFIG.COLOR.GOLD).setTimestamp();
        
        channel.send({ content: `🔔 Trận đấu **#${mId}** đã sẵn sàng!`, embeds: [startEmbed] });

        // --- GỬI ĐẾN KÊNH THEO DÕI ---
        const trackChan = await guild.channels.fetch(CONFIG.TRACKING_CHANNEL_ID).catch(() => null);
        if (trackChan) {
            const trackEmbed = new EmbedBuilder()
                .setTitle(`📡 TRẬN ĐẤU ĐANG DIỄN RA | #${mId}`)
                .setDescription(`Chế độ: **${mode}**`)
                .addFields(
                    { name: `Đội ${tNames[0]}`, value: t1.map(p => p.name).join(', '), inline: false },
                    { name: `Đội ${tNames[1]}`, value: t2.map(p => p.name).join(', '), inline: false }
                )
                .setColor(CONFIG.COLOR.BLUE).setTimestamp();
            await trackChan.send({ embeds: [trackEmbed] });
        }

        // --- XỬ LÝ DM & AUTO-MOVE ---
        const allPlayers = [...t1.map(p => ({...p, vc: vc1})), ...t2.map(p => ({...p, vc: vc2}))];
        for (const p of allPlayers) {
            const member = await guild.members.fetch(p.id).catch(() => null);
            if (!member) continue;

            const dmEmbed = new EmbedBuilder()
                .setTitle("🎮 PRIMEBLOX MATCH READY")
                .setDescription(`Trận #${mId} đã bắt đầu!\n\n🔗 **SERVER VIP:** [CLICK VÀO ĐÂY](${CONFIG.VIP_LINK})\n🔊 **KÊNH VOICE:** ${p.vc.url}`)
                .setColor(CONFIG.COLOR.SUCCESS);

            try {
                await member.send({ embeds: [dmEmbed] });
            } catch (e) {
                channel.send(`⚠️ <@${p.id}> không mở DM! Link VIP: <${CONFIG.VIP_LINK}>`);
            }
            if (member.voice.channel) member.voice.setChannel(p.vc).catch(() => {});
        }
        updateSystemUI();
    } catch (err) { console.error("Lỗi khởi tạo trận:", err); }
}

// --- 6. EVENT: MESSAGE CREATE (LỆNH ADMIN & !j) ---
client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.content.startsWith('!')) return;
    const args = msg.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // !j [mode]
    if (command === 'j') {
        const mode = args[0];
        if (!queues[mode]) return msg.reply("❌ Mode hợp lệ: 1v1, 2v2, 5v5");
        const [userData] = await pool.execute('SELECT * FROM users WHERE discordId = ?', [msg.author.id]);
        if (!userData[0]) return msg.reply("❌ Bạn chưa xác minh tài khoản!");
        if (Object.values(queues).some(q => q.players.some(p => p.id === msg.author.id))) return msg.reply("🚫 Bạn đã ở trong hàng chờ!");

        queues[mode].players.push({ id: msg.author.id, name: userData[0].robloxName, elo: userData[0].elo });
        msg.reply(`✅ Bạn đã vào hàng chờ **${mode}** [\`${queues[mode].players.length}/${queues[mode].limit}\`]`);
        updateSystemUI();
        if (queues[mode].players.length === queues[mode].limit) await startMatch(mode, msg.guild, msg.channel);
    }

    // !win [ID] [TeamName]
    if (command === 'win' && msg.member.roles.cache.has(CONFIG.ADMIN_ROLE_ID)) {
        const mId = parseInt(args[0]);
        const winnerName = args[1]?.toUpperCase();
        const mIdx = activeMatches.findIndex(m => m.id === mId);
        if (mIdx === -1) return msg.reply("❌ Không tìm thấy trận đấu.");

        const match = activeMatches[mIdx];
        const winners = (winnerName === match.t1Name) ? match.t1P : match.t2P;
        const losers = (winnerName === match.t1Name) ? match.t2P : match.t1P;

        for (const p of winners) await pool.execute('UPDATE users SET elo = elo + ?, wins = wins + 1 WHERE discordId = ?', [CONFIG.ELO.GAIN, p.id]);
        for (const p of losers) await pool.execute('UPDATE users SET elo = GREATEST(0, elo - ?), losses = losses + 1 WHERE discordId = ?', [CONFIG.ELO.LOSS, p.id]);

        // Xóa Voice
        for (const vId of match.voices) {
            const ch = await msg.guild.channels.fetch(vId).catch(() => null);
            if (ch) await ch.delete().catch(() => {});
        }
        
        msg.channel.send(`🏆 Trận **#${mId}** kết thúc! Đội **${winnerName}** thắng.`);
        activeMatches.splice(mIdx, 1);
        updateSystemUI();
    }

    // !cancel [ID]
    if (command === 'cancel' && msg.member.roles.cache.has(CONFIG.ADMIN_ROLE_ID)) {
        const mId = parseInt(args[0]);
        const mIdx = activeMatches.findIndex(m => m.id === mId);
        if (mIdx === -1) return msg.reply("❌ Không thấy trận này.");

        for (const vId of activeMatches[mIdx].voices) {
            const ch = await msg.guild.channels.fetch(vId).catch(() => null);
            if (ch) await ch.delete().catch(() => {});
        }
        activeMatches.splice(mIdx, 1);
        msg.reply(`🚫 Đã hủy trận **#${mId}** và xóa Voice.`);
        updateSystemUI();
    }
});

// --- 7. EVENT: INTERACTION (BUTTON & MODAL) ---
client.on('interactionCreate', async (i) => {
    if (i.isButton()) {
        const [userData] = await pool.execute('SELECT * FROM users WHERE discordId = ?', [i.user.id]);
        
        if (i.customId.startsWith('q_')) {
            const mode = i.customId.split('_')[1];
            if (!userData[0]) return i.reply({ content: "❌ Hãy xác minh trước!", ephemeral: true });
            await i.deferUpdate();
            if (Object.values(queues).some(q => q.players.some(p => p.id === i.user.id))) return;

            queues[mode].players.push({ id: i.user.id, name: userData[0].robloxName, elo: userData[0].elo });
            i.channel.send(`📥 **${userData[0].robloxName}** tham gia hàng chờ **${mode}**.`);
            updateSystemUI();
            if (queues[mode].players.length === queues[mode].limit) await startMatch(mode, i.guild, i.channel);
        }

        if (i.customId === 'v_start') {
            const modal = new ModalBuilder().setCustomId('mod_v').setTitle('XÁC MINH');
            const input = new TextInputBuilder().setCustomId('r_n').setLabel("TÊN ROBLOX").setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await i.showModal(modal);
        }
    }

    if (i.type === InteractionType.ModalSubmit && i.customId === 'mod_v') {
        await i.deferReply({ ephemeral: true });
        const name = i.fields.getTextInputValue('r_n');
        try {
            const rId = await nblox.getIdFromUsername(name);
            await pool.execute('INSERT INTO users (discordId, robloxName, robloxId, elo) VALUES (?, ?, ?, 1000)', [i.user.id, name, rId.toString()]);
            await i.editReply(`✅ Thành công! Chào mừng **${name}**.`);
            updateSystemUI();
        } catch (e) { await i.editReply("❌ Lỗi tìm tên Roblox!"); }
    }
});

client.on('ready', () => {
    console.log(`🚀 BOT ONLINE: ${client.user.tag}`);
    updateSystemUI();
});

client.login(process.env.DISCORD_TOKEN);
