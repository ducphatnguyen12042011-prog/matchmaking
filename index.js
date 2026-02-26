/**
 * ===========================================================================
 * 🏆 PRIMEBLOX MULTIPLAYER SYSTEM V14.5 - THE TITAN EDITION
 * 📋 PHIÊN BẢN: SIÊU CẤP TỐI THƯỢNG (450+ LINES)
 * 🛠️ TÍNH NĂNG: BUTTON QUEUE, MODAL VERIFY, AUTO-VOICE, ADVANCED ELO, LOGGING
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
    VERIFY_CHANNEL_ID: "1476202572594548799", 
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
    COOLDOWN: 3000 
};

// --- QUẢN LÝ DỮ LIỆU TẠM THỜI ---
const queues = { 
    "1v1": { players: [], limit: 2 }, 
    "2v2": { players: [], limit: 4 }, 
    "5v5": { players: [], limit: 10 } 
};
let activeMatches = [];
const teamNames = ["ALPHA", "OMEGA", "RADIANT", "DIRE", "STORM", "THUNDER", "TITAN", "PHOENIX", "SHADOW", "GHOST"];

// --- KẾT NỐI CƠ SỞ DỮ LIỆU MYSQL ---
const pool = mysql.createPool({ 
    uri: process.env.DATABASE_URL, 
    ssl: { rejectUnauthorized: false },
    waitForConnections: true,
    connectionLimit: 20,
    queueLimit: 0
});

// --- HÀM TRỢ GIÚP (UTILITIES) ---

function getRankTier(elo) {
    if (elo >= 2500) return "👑 GRANDMASTER";
    if (elo >= 2000) return "🎖️ ELITE MASTER";
    if (elo >= 1500) return "💎 DIAMOND";
    if (elo >= 1200) return "🔥 PLATINUM";
    if (elo >= 1000) return "🌟 GOLD";
    return "💿 SILVER";
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

        // 2. Cập nhật Panel Điều khiển
        if (vChan) {
            const vEmbed = new EmbedBuilder()
                .setTitle("⚔️ PRIMEBLOX MATCHMAKING CENTER")
                .setDescription("Chào mừng chiến binh! Chọn chế độ hoặc xác minh để bắt đầu thi đấu.")
                .addFields(
                    { name: "📝 Quy trình", value: "1. Bấm **Xác Minh**\n2. Chọn Mode\n3. Đợi đủ người và kiểm tra DM." },
                    { name: "📊 Trạng thái Queue", value: `1v1: **${queues["1v1"].players.length}/2** | 2v2: **${queues["2v2"].players.length}/4** | 5v5: **${queues["5v5"].players.length}/10**` }
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
                new ButtonBuilder().setCustomId('v_unlink').setLabel('Hủy Liên Kết').setStyle(ButtonStyle.Danger).setEmoji('🔓'),
                new ButtonBuilder().setCustomId('sys_refresh').setLabel('Làm mới').setStyle(ButtonStyle.Secondary).setEmoji('🔄')
            );

            const messages = await vChan.messages.fetch({ limit: 10 });
            const botMsg = messages.find(m => m.author.id === client.user.id && m.components.length > 0);
            if (botMsg) await botMsg.edit({ embeds: [vEmbed], components: [row, row2] });
            else await vChan.send({ embeds: [vEmbed], components: [row, row2] });
        }
    } catch (err) { console.error("UI Update Error:", err); }
}

// --- EVENT: BOT READY ---
client.on('ready', async () => {
    console.log(`🚀 [PRIMEBLOX] ${client.user.tag} đã sẵn sàng phục vụ!`);
    client.user.setPresence({ 
        activities: [{ name: 'Counter-Blox Master', type: ActivityType.Competing }], 
        status: 'online' 
    });
    await updateSystemUI();
});

// --- EVENT: INTERACTION (BUTTON & MODAL) ---
client.on('interactionCreate', async (i) => {
    // 1. XỬ LÝ NÚT BẤM (BUTTONS)
    if (i.isButton()) {
        const [userData] = await pool.execute('SELECT * FROM users WHERE discordId = ?', [i.user.id]);

        // Nút Xác Minh
        if (i.customId === 'v_start') {
            if (userData[0]) return i.reply({ content: `⚠️ Bạn đã liên kết với: **${userData[0].robloxName}**.`, ephemeral: true });
            const modal = new ModalBuilder().setCustomId('modal_verify').setTitle('XÁC MINH ROBLOX');
            const input = new TextInputBuilder().setCustomId('r_name').setLabel("NHẬP TÊN ROBLOX CỦA BẠN").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(20);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return await i.showModal(modal);
        }

        // Nút Unlink
        if (i.customId === 'v_unlink') {
            if (!userData[0]) return i.reply({ content: "❌ Bạn chưa có dữ liệu.", ephemeral: true });
            await pool.execute('DELETE FROM users WHERE discordId = ?', [i.user.id]);
            await i.reply({ content: "🔓 Đã hủy liên kết.", ephemeral: true });
            return sendLog("UNLINK", `${i.user.tag} đã rời bỏ hệ thống.`, CONFIG.COLOR.ERROR);
        }

        // Nút Refresh
        if (i.customId === 'sys_refresh') {
            await i.deferUpdate();
            return updateSystemUI();
        }

        // THAM GIA HÀNG CHỜ (1v1, 2v2, 5v5)
        if (i.customId.startsWith('q_')) {
            const mode = i.customId.split('_')[1];
            if (!userData[0]) return i.reply({ content: "❌ Hãy xác minh tài khoản trước!", ephemeral: true });

            // Tránh lỗi interaction failed bằng deferUpdate
            await i.deferUpdate();

            const inQueue = Object.values(queues).some(q => q.players.some(p => p.id === i.user.id));
            if (inQueue) return i.followUp({ content: "🚫 Bạn đã ở trong một hàng chờ khác!", ephemeral: true });

            queues[mode].players.push({ id: i.user.id, name: userData[0].robloxName, elo: userData[0].elo });
            i.channel.send(`📥 **${userData[0].robloxName}** (\`${userData[0].elo}\`) tham gia **${mode}** [\`${queues[mode].players.length}/${queues[mode].limit}\`]`);
            updateSystemUI();

            // ĐỦ NGƯỜI -> TẠO TRẬN
            if (queues[mode].players.length === queues[mode].limit) {
                const matchPlayers = [...queues[mode].players];
                queues[mode].players = []; // Reset queue ngay lập tức
                
                const mId = Math.floor(100000 + Math.random() * 899999);
                matchPlayers.sort(() => 0.5 - Math.random());
                const team1 = matchPlayers.slice(0, matchPlayers.length / 2);
                const team2 = matchPlayers.slice(matchPlayers.length / 2);
                const tNames = [...teamNames].sort(() => 0.5 - Math.random());

                try {
                    const category = i.guild.channels.cache.get(CONFIG.CATEGORY_VOICE_ID);
                    const parent = category ? CONFIG.CATEGORY_VOICE_ID : null;

                    const vc1 = await i.guild.channels.create({
                        name: `🔊 ĐỘI ${tNames[0]} [#${mId}]`,
                        type: ChannelType.GuildVoice,
                        parent: parent,
                        permissionOverwrites: [
                            { id: i.guild.id, deny: [PermissionsBitField.Flags.Connect] },
                            ...team1.map(p => ({ id: p.id, allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] }))
                        ]
                    });

                    const vc2 = await i.guild.channels.create({
                        name: `🔊 ĐỘI ${tNames[1]} [#${mId}]`,
                        type: ChannelType.GuildVoice,
                        parent: parent,
                        permissionOverwrites: [
                            { id: i.guild.id, deny: [PermissionsBitField.Flags.Connect] },
                            ...team2.map(p => ({ id: p.id, allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] }))
                        ]
                    });

                    activeMatches.push({ id: mId, mode, t1Name: tNames[0], t2Name: tNames[1], t1P: team1, t2P: team2, voices: [vc1.id, vc2.id] });

                    const startEmbed = new EmbedBuilder()
                        .setTitle(`⚔️ TRẬN ĐẤU ${mode} BẮT ĐẦU | ID: #${mId}`)
                        .addFields(
                            { name: `🟦 ĐỘI ${tNames[0]}`, value: team1.map(p => `• **${p.name}** (\`${p.elo}\`)`).join('\n'), inline: true },
                            { name: `🟥 ĐỘI ${tNames[1]}`, value: team2.map(p => `• **${p.name}** (\`${p.elo}\`)`).join('\n'), inline: true }
                        )
                        .setColor(CONFIG.COLOR.GOLD).setImage(CONFIG.BANNER_URL).setTimestamp();
                    
                    i.channel.send({ content: `<@${team1[0].id}> vs <@${team2[0].id}>`, embeds: [startEmbed] });

                    // Gửi DM & Auto-move
                    const allP = [...team1.map(p => ({...p, vc: vc1})), ...team2.map(p => ({...p, vc: vc2}))];
                    for (const p of allP) {
                        const member = await i.guild.members.fetch(p.id).catch(() => null);
                        if (!member) continue;

                        const dmEmbed = new EmbedBuilder()
                            .setTitle("🎮 PRIMEBLOX MATCH START")
                            .setDescription(`Trận đấu **#${mId}** đã sẵn sàng!\n\n🔗 [CLICK VÀO ĐÂY ĐỂ VÀO SERVER VIP](${CONFIG.VIP_LINK})\n🔊 Voice: ${p.vc.url}`)
                            .setColor(CONFIG.COLOR.SUCCESS).setTimestamp();

                        member.send({ embeds: [dmEmbed] }).catch(() => {
                            i.channel.send(`⚠️ <@${p.id}> không mở DM! Link: <${CONFIG.VIP_LINK}>`);
                        });
                        if (member.voice.channel) member.voice.setChannel(p.vc).catch(() => {});
                    }
                    sendLog("TRẬN ĐẤU", `Trận #${mId} [${mode}] đã bắt đầu.`, CONFIG.COLOR.INFO);
                } catch (err) { console.error("Match Creation Error:", err); }
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
                await pool.execute('INSERT INTO users (discordId, robloxName, robloxId, elo, wins, losses) VALUES (?, ?, ?, 1000, 0, 0)', [i.user.id, rName, rId.toString()]);
                await i.editReply(`✅ Xác minh thành công! Chào mừng **${rName}**.`);
                updateSystemUI();
                sendLog("VERIFY", `${i.user.tag} đã xác minh thành công Roblox: ${rName}`, CONFIG.COLOR.SUCCESS);
            } catch (e) {
                await i.editReply("❌ Không tìm thấy tên Roblox hoặc lỗi kết nối.");
            }
        }
    }
});

// --- EVENT: TIN NHẮN (ADMIN COMMANDS) ---
client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.content.startsWith('!')) return;

    const args = msg.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // !win [MatchID] [TeamName] [Score]
    if (command === 'win') {
        if (!msg.member.roles.cache.has(CONFIG.ADMIN_ROLE_ID)) return msg.reply("🚫 Bạn không đủ quyền hạn!");

        const mId = parseInt(args[0]);
        const winnerName = args[1]?.toUpperCase();
        const score = args[2] || "N/A";

        const mIdx = activeMatches.findIndex(m => m.id === mId);
        if (mIdx === -1) return msg.reply("❌ ID trận đấu không tồn tại.");

        const match = activeMatches[mIdx];
        const winners = (winnerName === match.t1Name) ? match.t1P : match.t2P;
        const losers = (winnerName === match.t1Name) ? match.t2P : match.t1P;

        // Cập nhật Database
        for (const p of winners) await pool.execute('UPDATE users SET elo = elo + ?, wins = wins + 1 WHERE discordId = ?', [CONFIG.ELO.GAIN, p.id]);
        for (const p of losers) await pool.execute('UPDATE users SET elo = GREATEST(0, elo - ?), losses = losses + 1 WHERE discordId = ?', [CONFIG.ELO.LOSS, p.id]);

        const winEmbed = new EmbedBuilder()
            .setTitle(`🏁 KẾT THÚC TRẬN ĐẤU #${mId}`)
            .addFields(
                { name: '📊 TỈ SỐ', value: `> **${score}**`, inline: false },
                { name: `🏆 THẮNG: ${winnerName}`, value: winners.map(p => `🥇 **${p.name}** \`(+${CONFIG.ELO.GAIN})\``).join('\n'), inline: true },
                { name: `💀 THUA`, value: losers.map(p => `🥈 **${p.name}** \`(-${CONFIG.ELO.LOSS})\``).join('\n'), inline: true }
            )
            .setColor(CONFIG.COLOR.GOLD).setTimestamp();

        msg.channel.send({ embeds: [winEmbed] });

        // Xóa Voice & Thông báo DM
        for (const vId of match.voices) {
            const ch = await msg.guild.channels.fetch(vId).catch(() => null);
            if (ch) await ch.delete().catch(() => {});
        }
        for (const p of winners) {
            const m = await msg.guild.members.fetch(p.id).catch(() => null);
            if (m) m.send(`🎊 Bạn đã thắng trận **#${mId}**! +${CONFIG.ELO.GAIN} ELO.`).catch(() => {});
        }

        activeMatches.splice(mIdx, 1);
        updateSystemUI();
        sendLog("WIN", `Trận #${mId} kết thúc. Đội thắng: ${winnerName}`, CONFIG.COLOR.GOLD);
    }

    // !stats [@user]
    if (command === 'stats') {
        const target = msg.mentions.users.first() || msg.author;
        const [rows] = await pool.execute('SELECT * FROM users WHERE discordId = ?', [target.id]);
        if (!rows[0]) return msg.reply("❌ Người chơi này chưa xác minh.");

        const u = rows[0];
        const embed = new EmbedBuilder()
            .setTitle(`🛡️ CHIẾN BINH: ${u.robloxName}`)
            .setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${u.robloxId}&width=420&height=420&format=png`)
            .addFields(
                { name: "🏆 Rank", value: getRankTier(u.elo), inline: true },
                { name: "🔥 ELO", value: `\`${u.elo}\``, inline: true },
                { name: "⚔️ Thắng/Bại", value: `\`${u.wins}W / ${u.losses}L\``, inline: true }
            )
            .setColor(CONFIG.COLOR.BLUE).setTimestamp();
        msg.reply({ embeds: [embed] });
    }

    // !cancel [MatchID]
    if (command === 'cancel' && msg.member.roles.cache.has(CONFIG.ADMIN_ROLE_ID)) {
        const mId = parseInt(args[0]);
        const mIdx = activeMatches.findIndex(m => m.id === mId);
        if (mIdx === -1) return msg.reply("❌ Không tìm thấy trận.");
        
        const match = activeMatches[mIdx];
        for (const vId of match.voices) {
            const ch = await msg.guild.channels.fetch(vId).catch(() => null);
            if (ch) await ch.delete().catch(() => {});
        }
        activeMatches.splice(mIdx, 1);
        msg.reply(`🚫 Đã hủy trận đấu #${mId}.`);
    }
});

// --- KHỞI CHẠY ---
client.login(process.env.DISCORD_TOKEN);
