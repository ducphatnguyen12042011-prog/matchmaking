/**
 * ===========================================================================
 * 🏆 PRIMEBLOX MULTIPLAYER SYSTEM V12.8 - ULTIMATE ELITE EDITION
 * 📋 FULL: AUTO-LB, VOICE LOCK, AUTO-MOVE, STREAK, DM-NOTIFY, RANK TIERS
 * 🛠️ DEVELOPED FOR: COMPETITIVE COUNTER-BLOX PROFESSIONAL
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

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User]
});

// --- CẤU HÌNH HỆ THỐNG CHI TIẾT ---
const CONFIG = {
    ADMIN_ROLE_ID: "1465374336214106237",
    VERIFY_CHANNEL_ID: "1476202572594548799",
    LB_CHANNEL_ID: "1474674662792232981", 
    CATEGORY_VOICE_ID: "1476182203653161061", 
    LOG_CHANNEL_ID: "1476182400617680968",
    VIP_LINK: "https://www.roblox.com/vi/games/301549746/Counter-Blox?privateServerLinkCode=56786714113746670670511968107962",
    BANNER_URL: "https://www.dexerto.com/cdn-image/wp-content/uploads/2026/01/22/Counter-Blox-codes.jpg?width=1200&quality=60&format=auto",
    COLOR: { 
        SUCCESS: 0x2ecc71, 
        ERROR: 0xe74c3c, 
        INFO: 0x3498db, 
        GOLD: 0xf1c40f, 
        DARK: 0x2b2d31,
        PURPLE: 0x9b59b6
    },
    ELO: { GAIN: 25, LOSS: 20 }
};

const queues = { 
    "1v1": { players: [], limit: 2 }, 
    "2v2": { players: [], limit: 4 }, 
    "5v5": { players: [], limit: 10 } 
};
let activeMatches = [];
const teamNames = ["ALPHA", "OMEGA", "RADIANT", "DIRE", "STORM", "THUNDER", "TITAN", "PHOENIX", "SHADOW", "GHOST"];

const pool = mysql.createPool({ uri: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// --- HÀM PHÂN CẤP RANK ---
function getRankTier(elo) {
    if (elo >= 2000) return "💎 DIAMOND ELITE";
    if (elo >= 1500) return "🥇 PLATINUM";
    if (elo >= 1200) return "🥈 GOLD";
    if (elo >= 1000) return "🥉 SILVER";
    return "🥉 BRONZE";
}

// --- HÀM GỬI LOG HỆ THỐNG ---
async function sendLog(title, desc, color) {
    const logChan = await client.channels.fetch(CONFIG.LOG_CHANNEL_ID).catch(() => null);
    if (!logChan) return;
    const embed = new EmbedBuilder()
        .setTitle(`🛠️ LOG: ${title}`)
        .setDescription(desc)
        .setColor(color)
        .setTimestamp();
    logChan.send({ embeds: [embed] });
}

// --- HÀM GỬI VERIFY ---
async function sendVerifyEmbed(channel) {
    const embed = new EmbedBuilder()
        .setTitle("🛡️ PRIMEBLOX — ACCOUNT VERIFICATION")
        .setDescription("Chào mừng bạn đến với hệ thống Competitive. Vui lòng liên kết tài khoản Roblox để tiếp tục.\n\n**HƯỚNG DẪN:**\n1. Nhấn nút bên dưới\n2. Nhập đúng Username Roblox\n3. Chờ Bot xử lý dữ liệu")
        .addFields({ name: "⚠️ LƯU Ý", value: "Một tài khoản Discord chỉ được liên kết với một tài khoản Roblox duy nhất." })
        .setColor(CONFIG.COLOR.INFO)
        .setImage(CONFIG.BANNER_URL)
        .setFooter({ text: "PrimeBlox Security System" });
    
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('v_start').setLabel('Xác minh ngay').setStyle(ButtonStyle.Primary).setEmoji('✅')
    );

    const msgs = await channel.messages.fetch({ limit: 10 });
    const oldVerify = msgs.filter(m => m.author.id === client.user.id && m.embeds[0]?.title?.includes("VERIFICATION"));
    
    if (oldVerify.size === 0) {
        await channel.send({ embeds: [embed], components: [row] });
    }
}

// --- HÀM CẬP NHẬT BXH TỰ ĐỘNG ---
async function updateAutoLB() {
    try {
        const channel = await client.channels.fetch(CONFIG.LB_CHANNEL_ID).catch(() => null);
        if (!channel) return;

        const [top] = await pool.execute('SELECT robloxName, elo, wins, losses, streak FROM users ORDER BY elo DESC LIMIT 10');
        
        const lbText = top.map((u, i) => {
            const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `**#${i+1}**`;
            const sEmoji = u.streak >= 3 ? "🔥" : (u.streak <= -3 ? "🧊" : "➖");
            return `${medal} **${u.robloxName}**\n╰ \`${u.elo} ELO\` • ${u.wins}W-${u.losses}L • ${sEmoji} \`${u.streak >= 0 ? '+' + u.streak : u.streak}\` • *${getRankTier(u.elo)}*`;
        }).join('\n\n');

        const embed = new EmbedBuilder()
            .setTitle("🏆 PRIMEBLOX LEADERBOARD - TOP 10")
            .setDescription(`*Dữ liệu được cập nhật mỗi 5 phút dựa trên thực lực các chiến binh.*\n\n${lbText || "Chưa có dữ liệu"}`)
            .setColor(CONFIG.COLOR.GOLD)
            .setThumbnail(CONFIG.BANNER_URL)
            .setTimestamp()
            .setFooter({ text: "Phát triển bởi PrimeBlox Studio" });

        const messages = await channel.messages.fetch({ limit: 5 });
        const lastBotMsg = messages.find(m => m.author.id === client.user.id);
        
        if (lastBotMsg) await lastBotMsg.edit({ embeds: [embed] });
        else await channel.send({ embeds: [embed] });
    } catch (e) { console.error("LB Error:", e); }
}

client.on('ready', async () => {
    console.log(`[READY] Bot Online: ${client.user.tag}`);
    client.user.setActivity('Ranked CB', { type: ActivityType.Competing });

    const vChannel = await client.channels.fetch(CONFIG.VERIFY_CHANNEL_ID).catch(() => null);
    if (vChannel) await sendVerifyEmbed(vChannel);

    updateAutoLB();
    setInterval(updateAutoLB, 300000); 
});

client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.guild) return;
    if (msg.channel.id === CONFIG.VERIFY_CHANNEL_ID) await sendVerifyEmbed(msg.channel);
    if (!msg.content.startsWith('!')) return;

    const args = msg.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // --- LỆNH JOIN ---
    if (command === 'j') {
        const mode = args[0];
        if (!queues[mode]) return msg.reply("⚠️ Sử dụng: `!j 1v1`, `!j 2v2` hoặc `!j 5v5`.");
        
        const [rows] = await pool.execute('SELECT * FROM users WHERE discordId = ?', [msg.author.id]);
        if (!rows[0]) return msg.reply(`❌ Bạn chưa xác minh! Hãy qua <#${CONFIG.VERIFY_CHANNEL_ID}>.`);
        
        if (Object.values(queues).some(q => q.players.some(p => p.id === msg.author.id))) {
            return msg.reply("🚫 Bạn đã ở trong một hàng chờ khác rồi!");
        }

        queues[mode].players.push({ id: msg.author.id, name: rows[0].robloxName, elo: rows[0].elo });
        
        const joinEmbed = new EmbedBuilder()
            .setDescription(`📥 **${rows[0].robloxName}** (\`${rows[0].elo}\`) đã vào hàng chờ **${mode}**\n📊 Hiện có: \`${queues[mode].players.length}/${queues[mode].limit}\``)
            .setColor(CONFIG.COLOR.SUCCESS);
        msg.channel.send({ embeds: [joinEmbed] });

        if (queues[mode].players.length === queues[mode].limit) {
            const players = [...queues[mode].players].sort(() => 0.5 - Math.random());
            queues[mode].players = [];
            const mId = Math.floor(100000 + Math.random() * 900000);
            const rN = [...teamNames].sort(() => 0.5 - Math.random());
            const t1 = players.slice(0, players.length / 2);
            const t2 = players.slice(players.length / 2);

            try {
                const vc1 = await msg.guild.channels.create({
                    name: `🔊 TEAM ${rN[0]} [#${mId}]`, type: ChannelType.GuildVoice, parent: CONFIG.CATEGORY_VOICE_ID,
                    permissionOverwrites: [
                        { id: msg.guild.id, deny: [PermissionsBitField.Flags.Connect] },
                        ...t1.map(p => ({ id: p.id, allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] }))
                    ]
                });
                const vc2 = await msg.guild.channels.create({
                    name: `🔊 TEAM ${rN[1]} [#${mId}]`, type: ChannelType.GuildVoice, parent: CONFIG.CATEGORY_VOICE_ID,
                    permissionOverwrites: [
                        { id: msg.guild.id, deny: [PermissionsBitField.Flags.Connect] },
                        ...t2.map(p => ({ id: p.id, allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] }))
                    ]
                });
                
                activeMatches.push({ id: mId, t1Name: rN[0], t2Name: rN[1], t1P: t1, t2P: t2, voices: [vc1.id, vc2.id] });

                const matchEmbed = new EmbedBuilder()
                    .setTitle(`⚔️ MATCH FOUND | TRẬN ĐẤU #${mId}`)
                    .addFields(
                        { name: `🟦 ĐỘI ${rN[0]}`, value: t1.map(p => `• **${p.name}** (\`${p.elo}\`)`).join('\n'), inline: true },
                        { name: `🟥 ĐỘI ${rN[1]}`, value: t2.map(p => `• **${p.name}** (\`${p.elo}\`)`).join('\n'), inline: true }
                    ).setImage(CONFIG.BANNER_URL).setColor(CONFIG.COLOR.GOLD).setFooter({ text: "Check DM để lấy Link VIP và Auto-Move" });

                msg.channel.send({ content: "@everyone", embeds: [matchEmbed] });

                const notify = async (pList, vc) => {
                    for (const p of pList) {
                        const m = await msg.guild.members.fetch(p.id).catch(() => null);
                        if (m) {
                            const dm = new EmbedBuilder()
                                .setTitle("🛡️ TRẬN ĐẤU CỦA BẠN ĐÃ SẴN SÀNG")
                                .setDescription(`Trận đấu: **#${mId}**\n\n🔗 **SERVER VIP:** [CLICK VÀO ĐÂY](${CONFIG.VIP_LINK})\n🔊 **KÊNH VOICE:** ${vc.url}`)
                                .setColor(CONFIG.COLOR.SUCCESS).setFooter({ text: "Hệ thống sẽ tự động kéo bạn vào phòng Voice." });
                            m.send({ embeds: [dm] }).catch(() => {});
                            if (m.voice.channel) m.voice.setChannel(vc).catch(() => {});
                        }
                    }
                };
                await notify(t1, vc1); await notify(t2, vc2);
            } catch (err) { console.error(err); }
        }
    }

    // --- LỆNH STATS ---
    if (command === 'stats') {
        const [r] = await pool.execute('SELECT * FROM users WHERE discordId = ?', [msg.author.id]);
        if (!r[0]) return msg.reply("❌ Bạn chưa xác minh!");
        
        const winrate = (r[0].wins + r[0].losses) === 0 ? "0%" : ((r[0].wins / (r[0].wins + r[0].losses)) * 100).toFixed(1) + "%";
        const embed = new EmbedBuilder()
            .setAuthor({ name: `Hồ sơ: ${r[0].robloxName}`, iconURL: msg.author.displayAvatarURL() })
            .addFields(
                { name: "🏆 Rank Tier", value: `\`${getRankTier(r[0].elo)}\``, inline: true },
                { name: "📈 ELO", value: `\`${r[0].elo}\``, inline: true },
                { name: "🔥 Streak", value: `\`${r[0].streak >= 0 ? '+' + r[0].streak : r[0].streak}\``, inline: true },
                { name: "📊 Thống kê", value: `Thắng: **${r[0].wins}** | Thua: **${r[0].losses}** | Winrate: **${winrate}**` }
            ).setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${r[0].robloxId}&width=420&height=420&format=png`)
            .setColor(CONFIG.COLOR.PURPLE);
        msg.reply({ embeds: [embed] });
    }

    // --- LỆNH WIN ---
    if (command === 'win') {
        if (!msg.member.roles.cache.has(CONFIG.ADMIN_ROLE_ID)) return;
        const mId = parseInt(args[0]);
        const winTeam = args[1]?.toUpperCase();
        const matchIdx = activeMatches.findIndex(m => m.id === mId);
        if (matchIdx === -1) return msg.reply("❌ Không tìm thấy ID trận này.");

        const match = activeMatches[matchIdx];
        const winners = (winTeam === match.t1Name) ? match.t1P : match.t2P;
        const losers = (winTeam === match.t1Name) ? match.t2P : match.t1P;

        for (const p of winners) {
            await pool.execute('UPDATE users SET elo = elo + ?, wins = wins + 1, streak = IF(streak < 0, 1, streak + 1) WHERE discordId = ?', [CONFIG.ELO.GAIN, p.id]);
        }
        for (const p of losers) {
            await pool.execute('UPDATE users SET elo = elo - ?, losses = losses + 1, streak = IF(streak > 0, -1, streak - 1) WHERE discordId = ?', [CONFIG.ELO.LOSS, p.id]);
        }

        const resEmbed = new EmbedBuilder()
            .setTitle(`🏁 TRẬN ĐẤU KẾT THÚC #${mId}`)
            .setDescription(`Admin **${msg.author.username}** xác nhận đội **${winTeam}** chiến thắng!`)
            .addFields(
                { name: "🏆 Đội Thắng", value: winners.map(p => `• ${p.name} (+${CONFIG.ELO.GAIN})`).join('\n') },
                { name: "💀 Đội Thua", value: losers.map(p => `• ${p.name} (-${CONFIG.ELO.LOSS})`).join('\n') }
            ).setColor(CONFIG.COLOR.GOLD).setTimestamp();
        
        msg.channel.send({ embeds: [resEmbed] });
        sendLog("KẾT THÚC TRẬN", `Trận #${mId} kết thúc bởi ${msg.author.tag}. Đội thắng: ${winTeam}`, CONFIG.COLOR.GOLD);

        for (const vId of match.voices) { 
            const ch = await msg.guild.channels.fetch(vId).catch(() => null); 
            if (ch) await ch.delete(); 
        }
        activeMatches.splice(matchIdx, 1);
        updateAutoLB();
    }

    // --- LỆNH CANCEL ---
    if (command === 'cancel') {
        if (!msg.member.roles.cache.has(CONFIG.ADMIN_ROLE_ID)) return;
        const mId = parseInt(args[0]);
        const matchIdx = activeMatches.findIndex(m => m.id === mId);
        if (matchIdx === -1) return msg.reply("❌ Không tìm thấy trận đấu.");

        const match = activeMatches[matchIdx];
        for (const vId of match.voices) { 
            const ch = await msg.guild.channels.fetch(vId).catch(() => null); 
            if (ch) await ch.delete(); 
        }
        activeMatches.splice(matchIdx, 1);
        msg.reply(`🚫 Đã hủy trận đấu **#${mId}** và xóa các kênh Voice.`);
        sendLog("HỦY TRẬN", `Admin ${msg.author.tag} đã hủy trận #${mId}`, CONFIG.COLOR.ERROR);
    }
});

// --- XỬ LÝ VERIFY ---
client.on('interactionCreate', async (i) => {
    if (i.isButton() && i.customId === 'v_start') {
        const modal = new ModalBuilder().setCustomId('m_v').setTitle('XÁC MINH ROBLOX');
        modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('r_u').setLabel("TÊN TÀI KHOẢN ROBLOX").setStyle(TextInputStyle.Short).setRequired(true)
        ));
        await i.showModal(modal);
    }
    if (i.type === InteractionType.ModalSubmit && i.customId === 'm_v') {
        const rName = i.fields.getTextInputValue('r_u');
        await i.deferReply({ ephemeral: true });
        try {
            const rId = await nblox.getIdFromUsername(rName);
            await pool.execute('INSERT INTO users (discordId, robloxName, robloxId, elo, wins, losses, streak) VALUES (?, ?, ?, 1000, 0, 0, 0) ON DUPLICATE KEY UPDATE robloxName = ?', [i.user.id, rName, rId.toString(), rName]);
            await i.editReply({ content: `✅ Xác minh thành công! Chào mừng **${rName}** tham gia giải đấu.` });
            sendLog("XÁC MINH", `Người dùng ${i.user.tag} đã liên kết với Roblox: ${rName}`, CONFIG.COLOR.SUCCESS);
        } catch (e) { await i.editReply({ content: "❌ Không tìm thấy tài khoản Roblox này!" }); }
    }
});

client.login(process.env.DISCORD_TOKEN);
