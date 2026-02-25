/**
 * ===========================================================================
 * 🏆 PRIMEBLOX MULTIPLAYER SYSTEM V12.9 - ULTIMATE COMPLETE EDITION
 * 📋 FULL: UNLINK, CHANGE ACCOUNT, AUTO-LB, VOICE LOCK, AUTO-MOVE, STREAK
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
    if (elo >= 2000) return "💠 ELITE MASTER";
    if (elo >= 1500) return "⚔️ DIAMOND";
    if (elo >= 1200) return "🔥 PLATINUM";
    if (elo >= 1000) return "🛡️ GOLD";
    return "🎗️ SILVER";
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

// --- HÀM GỬI VERIFY (NEW: UNLINK & CHANGE) ---
async function sendVerifyEmbed(channel) {
    const embed = new EmbedBuilder()
        .setTitle("🛡️ PRIMEBLOX — ACCOUNT MANAGEMENT")
        .setDescription("Chào mừng bạn đến với hệ thống Competitive.\n\n**HƯỚNG DẪN:**\n1️⃣ **Xác minh:** Liên kết tài khoản lần đầu.\n2️⃣ **Change:** Cập nhật tên Roblox mới.\n3️⃣ **Unlink:** Thoát và xóa hoàn toàn dữ liệu cũ.")
        .addFields({ name: "⚠️ CHÍNH SÁCH", value: "Để tránh Clone, nút **Xác minh** sẽ bị khóa nếu bạn đã có tài khoản trong hệ thống." })
        .setColor(CONFIG.COLOR.INFO)
        .setImage(CONFIG.BANNER_URL)
        .setFooter({ text: "PrimeBlox Security System" });
    
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('v_start').setLabel('Xác minh').setStyle(ButtonStyle.Primary).setEmoji('✅'),
        new ButtonBuilder().setCustomId('v_change').setLabel('Đổi Acc').setStyle(ButtonStyle.Secondary).setEmoji('🔄'),
        new ButtonBuilder().setCustomId('v_unlink').setLabel('Unlink').setStyle(ButtonStyle.Danger).setEmoji('🔓')
    );

    const msgs = await channel.messages.fetch({ limit: 10 });
    const oldVerify = msgs.filter(m => m.author.id === client.user.id && m.embeds[0]?.title?.includes("MANAGEMENT"));
    
    if (oldVerify.size === 0) {
        await channel.send({ embeds: [embed], components: [row] });
    }
}

// --- HÀM CẬP NHẬT BXH (NEW MEDALS) ---
async function updateAutoLB() {
    try {
        const channel = await client.channels.fetch(CONFIG.LB_CHANNEL_ID).catch(() => null);
        if (!channel) return;

        const [top] = await pool.execute('SELECT robloxName, elo, wins, losses, streak FROM users ORDER BY elo DESC LIMIT 10');
        
        const lbText = top.map((u, i) => {
            const medal = i === 0 ? "👑" : i === 1 ? "💎" : i === 2 ? "⭐" : `**#${i+1}**`;
            const sEmoji = u.streak >= 3 ? "🔥" : (u.streak <= -3 ? "🧊" : "➖");
            return `${medal} **${u.robloxName}**\n╰ \`${u.elo} ELO\` • ${u.wins}W-${u.losses}L • ${sEmoji} \`${u.streak >= 0 ? '+' + u.streak : u.streak}\` • *${getRankTier(u.elo)}*`;
        }).join('\n\n');

        const embed = new EmbedBuilder()
            .setTitle("🏆 PRIMEBLOX TOP WARRIORS")
            .setDescription(`*Dữ liệu tự động cập nhật sau mỗi trận đấu.*\n\n${lbText || "Chưa có dữ liệu"}`)
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
                        { name: `🟦 ĐỘI ${rN[0]}`, value: t1.map(p => `• **${p.name}**`).join('\n'), inline: true },
                        { name: `🟥 ĐỘI ${rN[1]}`, value: t2.map(p => `• **${p.name}**`).join('\n'), inline: true }
                    ).setImage(CONFIG.BANNER_URL).setColor(CONFIG.COLOR.GOLD).setFooter({ text: "Mở DM để nhận Link VIP" });

                msg.channel.send({ content: "@everyone", embeds: [matchEmbed] });

                const notify = async (pList, vc) => {
                    for (const p of pList) {
                        const m = await msg.guild.members.fetch(p.id).catch(() => null);
                        if (m) {
                            const dm = new EmbedBuilder()
                                .setTitle("🛡️ TRẬN ĐẤU BẮT ĐẦU")
                                .setDescription(`Trận: **#${mId}**\n🔗 **LINK VIP:** [VÀO GAME](${CONFIG.VIP_LINK})\n🔊 **VOICE:** ${vc.url}`)
                                .setColor(CONFIG.COLOR.SUCCESS);
                            m.send({ embeds: [dm] }).catch(() => {});
                            if (m.voice.channel) m.voice.setChannel(vc).catch(() => {});
                        }
                    }
                };
                await notify(t1, vc1); await notify(t2, vc2);
            } catch (err) { console.error(err); }
        }
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
            .setTitle(`🏁 TRẬN #${mId} KẾT THÚC`)
            .setDescription(`Admin **${msg.author.username}** xác nhận đội **${winTeam}** chiến thắng!`)
            .addFields(
                { name: "🏆 THẮNG", value: winners.map(p => `• ${p.name} (+${CONFIG.ELO.GAIN})`).join('\n'), inline: true },
                { name: "💀 THUA", value: losers.map(p => `• ${p.name} (-${CONFIG.ELO.LOSS})`).join('\n'), inline: true }
            ).setColor(CONFIG.COLOR.GOLD);
        
        msg.channel.send({ embeds: [resEmbed] });
        for (const vId of match.voices) { 
            const ch = await msg.guild.channels.fetch(vId).catch(() => null); 
            if (ch) await ch.delete(); 
        }
        activeMatches.splice(matchIdx, 1);
        updateAutoLB();
    }

    // --- LỆNH STATS ---
    if (command === 'stats') {
        const [r] = await pool.execute('SELECT * FROM users WHERE discordId = ?', [msg.author.id]);
        if (!r[0]) return msg.reply("❌ Bạn chưa xác minh!");
        const winrate = (r[0].wins + r[0].losses) === 0 ? "0%" : ((r[0].wins / (r[0].wins + r[0].losses)) * 100).toFixed(1) + "%";
        const embed = new EmbedBuilder()
            .setAuthor({ name: `Hồ sơ: ${r[0].robloxName}`, iconURL: msg.author.displayAvatarURL() })
            .addFields(
                { name: "🏆 Rank", value: `\`${getRankTier(r[0].elo)}\``, inline: true },
                { name: "📈 ELO", value: `\`${r[0].elo}\``, inline: true },
                { name: "🔥 Streak", value: `\`${r[0].streak}\``, inline: true },
                { name: "📊 Thống kê", value: `Thắng: **${r[0].wins}** | Thua: **${r[0].losses}** | Tỷ lệ: **${winrate}**` }
            ).setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${r[0].robloxId}&width=420&height=420&format=png`)
            .setColor(CONFIG.COLOR.PURPLE);
        msg.reply({ embeds: [embed] });
    }
    
    // --- LỆNH SETUP HELP ---
    if (command === 'setup-help') {
        if (!msg.member.roles.cache.has(CONFIG.ADMIN_ROLE_ID)) return;
        const helpEmbed = new EmbedBuilder()
            .setTitle("📖 HƯỚNG DẪN THAM GIA THI ĐẤU")
            .setDescription("1. Xác minh tại <#" + CONFIG.VERIFY_CHANNEL_ID + ">\n2. Dùng `!j 1v1` để tìm trận.\n3. Nhận Link VIP qua DM Bot.")
            .setColor(CONFIG.COLOR.INFO);
        msg.channel.send({ embeds: [helpEmbed] });
    }
});

// --- XỬ LÝ INTERACTION (VERIFY, UNLINK, CHANGE) ---
client.on('interactionCreate', async (i) => {
    if (i.isButton()) {
        const [user] = await pool.execute('SELECT * FROM users WHERE discordId = ?', [i.user.id]);
        
        // 1. Nút Xác minh
        if (i.customId === 'v_start') {
            if (user.length > 0) return i.reply({ content: `⚠️ Bạn đã liên kết với **${user[0].robloxName}**. Vui lòng nhấn **Unlink** để thoát trước khi đăng ký lại!`, ephemeral: true });
            const modal = new ModalBuilder().setCustomId('m_v').setTitle('XÁC MINH ROBLOX');
            modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('r_u').setLabel("TÊN TÀI KHOẢN ROBLOX").setStyle(TextInputStyle.Short).setRequired(true)));
            await i.showModal(modal);
        }

        // 2. Nút Unlink
        if (i.customId === 'v_unlink') {
            if (user.length === 0) return i.reply({ content: "❌ Bạn chưa có dữ liệu để xóa!", ephemeral: true });
            await pool.execute('DELETE FROM users WHERE discordId = ?', [i.user.id]);
            await i.reply({ content: "🔓 Đã hủy liên kết (Unlink) thành công. Dữ liệu của bạn đã được xóa sạch.", ephemeral: true });
            sendLog("UNLINK", `${i.user.tag} đã xóa dữ liệu.`, CONFIG.COLOR.ERROR);
        }

        // 3. Nút Change
        if (i.customId === 'v_change') {
            if (user.length === 0) return i.reply({ content: "❌ Bạn chưa xác minh tài khoản nào. Hãy dùng nút Xác minh!", ephemeral: true });
            const modal = new ModalBuilder().setCustomId('m_c').setTitle('ĐỔI TÀI KHOẢN ROBLOX');
            modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('r_u_new').setLabel("TÊN ROBLOX MỚI").setStyle(TextInputStyle.Short).setRequired(true)));
            await i.showModal(modal);
        }
    }

    if (i.type === InteractionType.ModalSubmit) {
        await i.deferReply({ ephemeral: true });
        const rName = i.fields.getTextInputValue(i.customId === 'm_v' ? 'r_u' : 'r_u_new');
        try {
            const rId = await nblox.getIdFromUsername(rName);
            if (i.customId === 'm_v') {
                await pool.execute('INSERT INTO users (discordId, robloxName, robloxId, elo, wins, losses, streak) VALUES (?, ?, ?, 1000, 0, 0, 0)', [i.user.id, rName, rId.toString()]);
            } else {
                await pool.execute('UPDATE users SET robloxName = ?, robloxId = ? WHERE discordId = ?', [rName, rId.toString(), i.user.id]);
            }
            await i.editReply(`✅ Thành công! Tài khoản hiện tại: **${rName}**`);
            updateAutoLB();
        } catch (e) { await i.editReply("❌ Lỗi: Không tìm thấy tên Roblox này!"); }
    }
});

client.login(process.env.DISCORD_TOKEN);
