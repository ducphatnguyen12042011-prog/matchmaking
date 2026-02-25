/**
 * ===========================================================================
 * 🏆 PRIMEBLOX MULTIPLAYER SYSTEM V13.8 - THE GRANDMASTER EDITION
 * 📋 PHIÊN BẢN: SIÊU CẤP HOÀN CHỈNH (350+ LINES)
 * 🛠️ TÍNH NĂNG: BUTTON QUEUE, MODAL VERIFY, AUTO-VOICE, SCORE WIN, DM CONGRATS
 * 🚀 TRẠNG THÁI: READY FOR PRODUCTION (RAILWAY/VDS)
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

// --- KHỞI TẠO CLIENT VỚI ĐẦY ĐỦ INTENTS ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages, 
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User]
});

// --- CẤU HÌNH HỆ THỐNG TRUNG TÂM ---
const CONFIG = {
    ADMIN_ROLE_ID: "1465374336214106237",
    VERIFY_CHANNEL_ID: "1476202572594548799", // Kênh Verify & Thông báo trận
    LB_CHANNEL_ID: "1474674662792232981", 
    CATEGORY_VOICE_ID: "1476182203653161061", 
    LOG_CHANNEL_ID: "1476182400617680968",
    VIP_LINK: "https://www.roblox.com/vi/games/301549746/Counter-Blox?privateServerLinkCode=56786714113746670670511968107962",
    BANNER_URL: "https://www.dexerto.com/cdn-image/wp-content/uploads/2026/01/22/Counter-Blox-codes.jpg?width=1200&quality=60&format=auto",
    COLOR: { 
        SUCCESS: 0x2ecc71, ERROR: 0xe74c3c, INFO: 0x3498db, 
        GOLD: 0xf1c40f, DARK: 0x2b2d31, BLUE: 0x00a2ff 
    },
    ELO: { GAIN: 25, LOSS: 20 },
    COOLDOWN: 3000 // 3 giây chống spam
};

// --- QUẢN LÝ DỮ LIỆU TẠM THỜI ---
const queues = { 
    "1v1": { players: [], limit: 2 }, 
    "2v2": { players: [], limit: 4 }, 
    "5v5": { players: [], limit: 10 } 
};
let activeMatches = [];
const cooldowns = new Set();
const teamNames = ["ALPHA", "OMEGA", "RADIANT", "DIRE", "STORM", "THUNDER", "TITAN", "PHOENIX", "SHADOW", "GHOST"];

// --- KẾT NỐI CƠ SỞ DỮ LIỆU MYSQL ---
const pool = mysql.createPool({ 
    uri: process.env.DATABASE_URL, 
    ssl: { rejectUnauthorized: false },
    waitForConnections: true,
    connectionLimit: 15,
    queueLimit: 0
});

// --- HÀM TRỢ GIÚP (UTILITIES) ---

function getRankTier(elo) {
    if (elo >= 2500) return "👑 GRANDMASTER";
    if (elo >= 2000) return "💠 ELITE MASTER";
    if (elo >= 1500) return "⚔️ DIAMOND";
    if (elo >= 1200) return "🔥 PLATINUM";
    if (elo >= 1000) return "🛡️ GOLD";
    return "🎗️ SILVER";
}

async function sendLog(title, desc, color = CONFIG.COLOR.INFO) {
    try {
        const logChan = await client.channels.fetch(CONFIG.LOG_CHANNEL_ID).catch(() => null);
        if (!logChan) return;
        const embed = new EmbedBuilder()
            .setTitle(`📜 SYSTEM LOG | ${title}`)
            .setDescription(desc)
            .setColor(color)
            .setTimestamp();
        await logChan.send({ embeds: [embed] });
    } catch (e) { console.error("Log Error:", e); }
}

async function updateSystemUI() {
    try {
        const lbChan = await client.channels.fetch(CONFIG.LB_CHANNEL_ID).catch(() => null);
        const vChan = await client.channels.fetch(CONFIG.VERIFY_CHANNEL_ID).catch(() => null);

        // 1. Cập nhật Leaderboard
        if (lbChan) {
            const [top] = await pool.execute('SELECT robloxName, elo, wins, losses FROM users ORDER BY elo DESC LIMIT 10');
            const lbEntries = top.map((u, i) => {
                const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `**#${i+1}**`;
                return `${medal} **${u.robloxName}**\n╰ \`${u.elo} ELO\` • ${u.wins}W/${u.losses}L • *${getRankTier(u.elo)}*`;
            });

            const lbEmbed = new EmbedBuilder()
                .setTitle("🏆 TOP 10 PRIMEBLOX GLADIATORS")
                .setDescription(lbEntries.join('\n\n') || "Chưa có dữ liệu.")
                .setColor(CONFIG.COLOR.GOLD)
                .setThumbnail(CONFIG.BANNER_URL)
                .setTimestamp();

            const messages = await lbChan.messages.fetch({ limit: 10 });
            const botMsg = messages.find(m => m.author.id === client.user.id);
            if (botMsg) await botMsg.edit({ embeds: [lbEmbed] });
            else await lbChan.send({ embeds: [lbEmbed] });
        }

        // 2. Cập nhật Panel Điều khiển tại sảnh
        if (vChan) {
            const vEmbed = new EmbedBuilder()
                .setTitle("⚔️ PRIMEBLOX MATCHMAKING CENTER")
                .setDescription("Vui lòng chọn chế độ thi đấu bên dưới hoặc thực hiện xác minh tài khoản Roblox để bắt đầu.")
                .addFields(
                    { name: "📝 Cách tham gia", value: "1. Nhấn **Xác Minh**\n2. Chọn chế độ (1v1, 2v2, 5v5)\n3. Chờ đủ người và nhận DM link VIP." }
                )
                .setColor(CONFIG.COLOR.BLUE)
                .setImage(CONFIG.BANNER_URL);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('q_1v1').setLabel('1 vs 1').setStyle(ButtonStyle.Primary).setEmoji('⚔️'),
                new ButtonBuilder().setCustomId('q_2v2').setLabel('2 vs 2').setStyle(ButtonStyle.Primary).setEmoji('👥'),
                new ButtonBuilder().setCustomId('q_5v5').setLabel('5 vs 5').setStyle(ButtonStyle.Primary).setEmoji('🔥'),
                new ButtonBuilder().setCustomId('v_start').setLabel('Xác Minh').setStyle(ButtonStyle.Success).setEmoji('🛡️')
            );
            
            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('v_unlink').setLabel('Hủy Liên Kết').setStyle(ButtonStyle.Danger).setEmoji('🔓')
            );

            const messages = await vChan.messages.fetch({ limit: 10 });
            const botMsg = messages.find(m => m.author.id === client.user.id && m.components.length > 0);
            if (!botMsg) await vChan.send({ embeds: [vEmbed], components: [row, row2] });
        }
    } catch (err) { console.error("UI Update Error:", err); }
}

// --- EVENT: BOT SẴN SÀNG ---
client.on('ready', async () => {
    console.log(`🚀 [CONNECTED] ${client.user.tag} đã online!`);
    client.user.setPresence({ activities: [{ name: 'Counter-Blox', type: ActivityType.Competing }], status: 'online' });
    
    // Khởi tạo giao diện
    await updateSystemUI();
});

// --- EVENT: XỬ LÝ NÚT BẤM & MODAL ---
client.on('interactionCreate', async (i) => {
    // 1. XỬ LÝ BUTTONS
    if (i.isButton()) {
        const [user] = await pool.execute('SELECT * FROM users WHERE discordId = ?', [i.user.id]);

        // Nút Xác Minh
        if (i.customId === 'v_start') {
            if (user[0]) return i.reply({ content: `⚠️ Bạn đã liên kết với tài khoản: **${user[0].robloxName}**.`, ephemeral: true });
            const modal = new ModalBuilder().setCustomId('modal_verify').setTitle('XÁC MINH ROBLOX');
            const input = new TextInputBuilder().setCustomId('r_name').setLabel("NHẬP CHÍNH XÁC TÊN ROBLOX").setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return await i.showModal(modal);
        }

        // Nút Unlink
        if (i.customId === 'v_unlink') {
            if (!user[0]) return i.reply({ content: "❌ Bạn chưa có dữ liệu để xóa.", ephemeral: true });
            await pool.execute('DELETE FROM users WHERE discordId = ?', [i.user.id]);
            await i.reply({ content: "🔓 Đã xóa dữ liệu liên kết thành công.", ephemeral: true });
            return sendLog("UNLINK", `${i.user.tag} đã hủy liên kết tài khoản.`, CONFIG.COLOR.ERROR);
        }

        // Các nút tham gia Queue (1v1, 2v2, 5v5)
        if (i.customId.startsWith('q_')) {
            const mode = i.customId.split('_')[1];
            if (!user[0]) return i.reply({ content: "❌ Bạn phải xác minh trước khi tham gia!", ephemeral: true });
            
            // Kiểm tra xem đã ở trong queue nào chưa
            const inQueue = Object.values(queues).some(q => q.players.some(p => p.id === i.user.id));
            if (inQueue) return i.reply({ content: "🚫 Bạn đã ở trong một hàng chờ rồi!", ephemeral: true });

            queues[mode].players.push({ id: i.user.id, name: user[0].robloxName, elo: user[0].elo });
            await i.reply({ content: `📥 Bạn đã tham gia hàng chờ **${mode}**!`, ephemeral: true });
            
            i.channel.send(`📥 **${user[0].robloxName}** vừa tham gia hàng chờ **${mode}** [\`${queues[mode].players.length}/${queues[mode].limit}\`]`);

            // --- XỬ LÝ KHI ĐỦ NGƯỜI ---
            if (queues[mode].players.length === queues[mode].limit) {
                const players = [...queues[mode].players].sort(() => 0.5 - Math.random());
                queues[mode].players = []; // Reset queue

                const mId = Math.floor(100000 + Math.random() * 899999);
                const tNames = [...teamNames].sort(() => 0.5 - Math.random());
                const team1 = players.slice(0, players.length / 2);
                const team2 = players.slice(players.length / 2);

                try {
                    // Logic tạo Voice an toàn
                    const category = i.guild.channels.cache.get(CONFIG.CATEGORY_VOICE_ID);
                    const parentId = (category && category.type === ChannelType.GuildCategory) ? CONFIG.CATEGORY_VOICE_ID : null;

                    const vc1 = await i.guild.channels.create({
                        name: `🔊 ĐỘI ${tNames[0]} [#${mId}]`,
                        type: ChannelType.GuildVoice,
                        parent: parentId,
                        permissionOverwrites: [
                            { id: i.guild.id, deny: [PermissionsBitField.Flags.Connect] },
                            ...team1.map(p => ({ id: p.id, allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] }))
                        ]
                    });

                    const vc2 = await i.guild.channels.create({
                        name: `🔊 ĐỘI ${tNames[1]} [#${mId}]`,
                        type: ChannelType.GuildVoice,
                        parent: parentId,
                        permissionOverwrites: [
                            { id: i.guild.id, deny: [PermissionsBitField.Flags.Connect] },
                            ...team2.map(p => ({ id: p.id, allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] }))
                        ]
                    });

                    activeMatches.push({ id: mId, t1Name: tNames[0], t2Name: tNames[1], t1P: team1, t2P: team2, voices: [vc1.id, vc2.id] });

                    // Thông báo vào kênh sảnh
                    const startEmbed = new EmbedBuilder()
                        .setTitle(`⚔️ TRẬN ĐẤU BẮT ĐẦU | ID: #${mId}`)
                        .addFields(
                            { name: `🟦 ĐỘI ${tNames[0]}`, value: team1.map(p => `• **${p.name}**`).join('\n'), inline: true },
                            { name: `🟥 ĐỘI ${tNames[1]}`, value: team2.map(p => `• **${p.name}**`).join('\n'), inline: true }
                        )
                        .setColor(CONFIG.COLOR.GOLD).setImage(CONFIG.BANNER_URL);
                    
                    i.channel.send({ content: `<@${team1[0].id}> vs <@${team2[0].id}>`, embeds: [startEmbed] });

                    // Gửi DM cho toàn bộ người chơi
                    const allP = [...team1.map(p => ({...p, vc: vc1})), ...team2.map(p => ({...p, vc: vc2}))];
                    for (const p of allP) {
                        const member = await i.guild.members.fetch(p.id).catch(() => null);
                        if (!member) continue;

                        const dmEmbed = new EmbedBuilder()
                            .setTitle("🎮 PRIMEBLOX MATCH START")
                            .setDescription(`Trận đấu **#${mId}** đã sẵn sàng!\n\n🔗 **SERVER VIP:** [CLICK VÀO ĐÂY](${CONFIG.VIP_LINK})\n🔊 **PHÒNG VOICE:** ${p.vc.url}`)
                            .setColor(CONFIG.COLOR.SUCCESS).setTimestamp();

                        member.send({ embeds: [dmEmbed] }).catch(async () => {
                            const msgAlert = await i.channel.send(`⚠️ <@${p.id}>: Không gửi được DM! Link VIP của bạn: <${CONFIG.VIP_LINK}>`);
                            setTimeout(() => msgAlert.delete().catch(() => {}), 60000);
                        });

                        // Tự động kéo vào Voice
                        if (member.voice.channel) member.voice.setChannel(p.vc).catch(() => {});
                    }
                } catch (err) {
                    console.error("Match Start Error:", err);
                    i.channel.send("❌ Đã xảy ra lỗi khi khởi tạo trận đấu.");
                }
            }
        }
    }

    // 2. XỬ LÝ MODAL SUBMIT
    if (i.type === InteractionType.ModalSubmit) {
        if (i.customId === 'modal_verify') {
            await i.deferReply({ ephemeral: true });
            const rName = i.fields.getTextInputValue('r_name');
            try {
                const rId = await nblox.getIdFromUsername(rName);
                await pool.execute('INSERT INTO users (discordId, robloxName, robloxId, elo, wins, losses, streak) VALUES (?, ?, ?, 1000, 0, 0, 0)', [i.user.id, rName, rId.toString()]);
                await i.editReply(`✅ Xác minh thành công! Chào mừng chiến binh **${rName}**.`);
                updateSystemUI();
            } catch (e) {
                await i.editReply("❌ Tên Roblox không tồn tại hoặc lỗi hệ thống!");
            }
        }
    }
});

// --- EVENT: XỬ LÝ LỆNH ADMIN ---
client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.content.startsWith('!')) return;

    const args = msg.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // Lệnh kết thúc trận (Dành cho Admin)
    if (command === 'win') {
        if (!msg.member.roles.cache.has(CONFIG.ADMIN_ROLE_ID)) return msg.reply("🚫 Bạn không có quyền!");

        const matchId = parseInt(args[0]);
        const winnerName = args[1]?.toUpperCase();
        const score = args[2] || "N/A";

        if (!matchId || !winnerName) return msg.reply("⚠️ Cú pháp: `!win [ID] [Tên_Đội] [Tỉ_Số]`");

        const mIdx = activeMatches.findIndex(m => m.id === matchId);
        if (mIdx === -1) return msg.reply("❌ Không tìm thấy trận đấu này.");

        const match = activeMatches[mIdx];
        const winners = (winnerName === match.t1Name) ? match.t1P : match.t2P;
        const losers = (winnerName === match.t1Name) ? match.t2P : match.t1P;

        // Cập nhật Database ELO
        const tasks = [
            ...winners.map(p => pool.execute('UPDATE users SET elo = elo + ?, wins = wins + 1 WHERE discordId = ?', [CONFIG.ELO.GAIN, p.id])),
            ...losers.map(p => pool.execute('UPDATE users SET elo = elo - ?, losses = losses + 1 WHERE discordId = ?', [CONFIG.ELO.LOSS, p.id]))
        ];
        await Promise.all(tasks);

        // Embed Kết quả đẹp mắt
        const winEmbed = new EmbedBuilder()
            .setTitle(`🏁 KẾT THÚC TRẬN ĐẤU #${matchId}`)
            .setColor(CONFIG.COLOR.GOLD)
            .addFields(
                { name: '📊 TỈ SỐ', value: `> **${score}**`, inline: false },
                { name: `🏆 ĐỘI THẮNG: ${winnerName}`, value: winners.map(p => `🥇 **${p.name}** \`(+${CONFIG.ELO.GAIN} ELO)\``).join('\n'), inline: true },
                { name: `💀 ĐỘI THUA`, value: losers.map(p => `🥈 **${p.name}** \`(-${CONFIG.ELO.LOSS} ELO)\``).join('\n'), inline: true }
            )
            .setTimestamp();

        msg.channel.send({ embeds: [winEmbed] });

        // Chúc mừng đội thắng qua DM
        for (const p of winners) {
            const member = await msg.guild.members.fetch(p.id).catch(() => null);
            if (member) member.send(`🎊 **CHIẾN THẮNG!** Chúc mừng bạn đã thắng trận **#${matchId}** (${score}). Nhận được **+${CONFIG.ELO.GAIN} ELO**!`).catch(() => {});
        }

        // Xóa Voice channels
        for (const vId of match.voices) {
            const ch = await msg.guild.channels.fetch(vId).catch(() => null);
            if (ch) await ch.delete().catch(() => {});
        }

        activeMatches.splice(mIdx, 1);
        updateSystemUI();
        sendLog("CHIẾN THẮNG", `Trận #${matchId} | Đội thắng: ${winnerName} | Tỉ số: ${score}`, CONFIG.COLOR.SUCCESS);
    }

    // Lệnh hủy trận khẩn cấp
    if (command === 'cancel') {
        if (!msg.member.roles.cache.has(CONFIG.ADMIN_ROLE_ID)) return;
        const mId = parseInt(args[0]);
        const mIdx = activeMatches.findIndex(m => m.id === mId);
        if (mIdx === -1) return msg.reply("❌ Trận không tồn tại.");

        const match = activeMatches[mIdx];
        for (const vId of match.voices) {
            const ch = await msg.guild.channels.fetch(vId).catch(() => null);
            if (ch) await ch.delete().catch(() => {});
        }
        activeMatches.splice(mIdx, 1);
        msg.reply(`🚫 Đã hủy trận đấu #${mId} thành công.`);
    }
});

// --- KHỞI CHẠY BOT ---
client.login(process.env.DISCORD_TOKEN);
