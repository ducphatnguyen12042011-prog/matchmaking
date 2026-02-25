/**
 * ===========================================================================
 * 🏆 PRIMEBLOX MULTIPLAYER SYSTEM V12.9 - PROFESSIONAL EDITION
 * 📋 PHIÊN BẢN ĐẦY ĐỦ: UNLINK, CHANGE ACCOUNT, AUTO-LB, VOICE LOCK, STREAK
 * 🛠️ DEVELOPED FOR: COMPETITIVE COUNTER-BLOX PROFESSIONAL
 * 🚀 TRẠNG THÁI: HOÀN THIỆN 100% - ĐÃ FIX LỖI DM & STREAK
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

// --- CẤU HÌNH HỆ THỐNG CHI TIẾT (VUI LÒNG KIỂM TRA ID) ---
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

// --- QUẢN LÝ HÀNG CHỜ VÀ TRẬN ĐẤU ---
const queues = { 
    "1v1": { players: [], limit: 2 }, 
    "2v2": { players: [], limit: 4 }, 
    "5v5": { players: [], limit: 10 } 
};
let activeMatches = [];
const teamNames = ["ALPHA", "OMEGA", "RADIANT", "DIRE", "STORM", "THUNDER", "TITAN", "PHOENIX", "SHADOW", "GHOST"];

// --- KẾT NỐI DATABASE ---
const pool = mysql.createPool({ 
    uri: process.env.DATABASE_URL, 
    ssl: { rejectUnauthorized: false },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// --- HÀM HỖ TRỢ: PHÂN CẤP RANK ---
function getRankTier(elo) {
    if (elo >= 2000) return "💠 ELITE MASTER";
    if (elo >= 1500) return "⚔️ DIAMOND";
    if (elo >= 1200) return "🔥 PLATINUM";
    if (elo >= 1000) return "🛡️ GOLD";
    return "🎗️ SILVER";
}

// --- HÀM HỖ TRỢ: GỬI LOG HỆ THỐNG ---
async function sendLog(title, desc, color) {
    try {
        const logChan = await client.channels.fetch(CONFIG.LOG_CHANNEL_ID).catch(() => null);
        if (!logChan) return;
        const embed = new EmbedBuilder()
            .setTitle(`🛠️ LOG HỆ THỐNG: ${title}`)
            .setDescription(desc)
            .setColor(color)
            .setTimestamp();
        await logChan.send({ embeds: [embed] });
    } catch (e) { console.log("Lỗi gửi log:", e); }
}

// --- HÀM HỖ TRỢ: GỬI TIN NHẮN XÁC MINH ---
async function sendVerifyEmbed(channel) {
    const embed = new EmbedBuilder()
        .setTitle("🛡️ PRIMEBLOX — QUẢN LÝ TÀI KHOẢN")
        .setDescription("Chào mừng bạn đến với hệ thống Competitive.\n\n**HƯỚNG DẪN CHI TIẾT:**\n1️⃣ **Xác minh:** Liên kết tài khoản Roblox với Discord.\n2️⃣ **Đổi Acc:** Cập nhật lại tên Roblox nếu bạn đổi tên.\n3️⃣ **Unlink:** Xóa hoàn toàn dữ liệu cũ để đăng ký lại.")
        .addFields(
            { name: "⚠️ CHÍNH SÁCH", value: "Để tránh tình trạng Clone acc, mỗi Discord chỉ được liên kết 1 Roblox." },
            { name: "🕒 THỜI GIAN", value: "Hệ thống hoạt động 24/7." }
        )
        .setColor(CONFIG.COLOR.INFO)
        .setImage(CONFIG.BANNER_URL)
        .setFooter({ text: "PrimeBlox Security System • V12.9" });
    
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('v_start').setLabel('Xác minh').setStyle(ButtonStyle.Primary).setEmoji('✅'),
        new ButtonBuilder().setCustomId('v_change').setLabel('Đổi Acc').setStyle(ButtonStyle.Secondary).setEmoji('🔄'),
        new ButtonBuilder().setCustomId('v_unlink').setLabel('Unlink').setStyle(ButtonStyle.Danger).setEmoji('🔓')
    );

    const msgs = await channel.messages.fetch({ limit: 10 });
    const oldVerify = msgs.filter(m => m.author.id === client.user.id && m.embeds[0]?.title?.includes("QUẢN LÝ"));
    
    if (oldVerify.size === 0) {
        await channel.send({ embeds: [embed], components: [row] });
    }
}

// --- HÀM HỖ TRỢ: CẬP NHẬT BẢNG XẾP HẠNG ---
async function updateAutoLB() {
    try {
        const channel = await client.channels.fetch(CONFIG.LB_CHANNEL_ID).catch(() => null);
        if (!channel) return;

        const [top] = await pool.execute('SELECT robloxName, elo, wins, losses, streak FROM users ORDER BY elo DESC LIMIT 10');
        
        const lbText = top.map((u, i) => {
            const medal = i === 0 ? "👑" : i === 1 ? "💎" : i === 2 ? "⭐" : `**#${i+1}**`;
            const sEmoji = u.streak >= 3 ? "🔥" : (u.streak <= -3 ? "🧊" : "➖");
            const streakVal = u.streak >= 0 ? `+${u.streak}` : u.streak;
            return `${medal} **${u.robloxName}**\n╰ \`${u.elo} ELO\` • ${u.wins}W-${u.losses}L • ${sEmoji} \`${streakVal}\` • *${getRankTier(u.elo)}*`;
        }).join('\n\n');

        const embed = new EmbedBuilder()
            .setTitle("🏆 PRIMEBLOX TOP 10 WARRIORS")
            .setDescription(`*Bảng xếp hạng cập nhật tự động sau mỗi trận đấu.*\n\n${lbText || "Chưa có dữ liệu người chơi."}`)
            .setColor(CONFIG.COLOR.GOLD)
            .setThumbnail(CONFIG.BANNER_URL)
            .setTimestamp()
            .setFooter({ text: "Phát triển bởi PrimeBlox Studio" });

        const messages = await channel.messages.fetch({ limit: 5 });
        const lastBotMsg = messages.find(m => m.author.id === client.user.id);
        
        if (lastBotMsg) await lastBotMsg.edit({ embeds: [embed] });
        else await channel.send({ embeds: [embed] });
    } catch (e) { console.error("Lỗi cập nhật BXH:", e); }
}

// --- EVENT: BOT READY ---
client.on('ready', async () => {
    console.log(`[HỆ THỐNG] Bot đã sẵn sàng: ${client.user.tag}`);
    client.user.setActivity('Competitive Counter-Blox', { type: ActivityType.Competing });

    const vChannel = await client.channels.fetch(CONFIG.VERIFY_CHANNEL_ID).catch(() => null);
    if (vChannel) await sendVerifyEmbed(vChannel);

    updateAutoLB();
    setInterval(updateAutoLB, 300000); // 5 phút cập nhật 1 lần
});

// --- EVENT: XỬ LÝ LỆNH CHAT ---
client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.guild) return;

    // Reset Verify Embed nếu bị trôi
    if (msg.channel.id === CONFIG.VERIFY_CHANNEL_ID) {
        if (msg.content === '!reset-verify' && msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            await sendVerifyEmbed(msg.channel);
            return msg.delete();
        }
    }

    if (!msg.content.startsWith('!')) return;

    const args = msg.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // --- LỆNH JOIN HÀNG CHỜ ---
    if (command === 'j' || command === 'join') {
        const mode = args[0];
        if (!queues[mode]) return msg.reply("⚠️ Định dạng sai! Sử dụng: `!j 1v1`, `!j 2v2` hoặc `!j 5v5`.");
        
        const [rows] = await pool.execute('SELECT * FROM users WHERE discordId = ?', [msg.author.id]);
        if (!rows[0]) return msg.reply(`❌ Bạn chưa xác minh! Hãy liên kết tại <#${CONFIG.VERIFY_CHANNEL_ID}>.`);
        
        // Kiểm tra xem đã trong hàng chờ nào chưa
        const isWaiting = Object.values(queues).some(q => q.players.some(p => p.id === msg.author.id));
        if (isWaiting) return msg.reply("🚫 Bạn đã có mặt trong một hàng chờ khác rồi!");

        queues[mode].players.push({ 
            id: msg.author.id, 
            name: rows[0].robloxName, 
            elo: rows[0].elo 
        });
        
        const joinEmbed = new EmbedBuilder()
            .setAuthor({ name: rows[0].robloxName, iconURL: msg.author.displayAvatarURL() })
            .setDescription(`📥 Đã vào hàng chờ **${mode}**\n📊 Trạng thái: \`${queues[mode].players.length}/${queues[mode].limit}\``)
            .setColor(CONFIG.COLOR.SUCCESS);
        msg.channel.send({ embeds: [joinEmbed] });

        // --- KHI ĐỦ NGƯỜI (MATCHMAKING LOGIC) ---
        if (queues[mode].players.length === queues[mode].limit) {
            const players = [...queues[mode].players].sort(() => 0.5 - Math.random());
            queues[mode].players = []; // Reset hàng chờ

            const mId = Math.floor(100000 + Math.random() * 900000);
            const rN = [...teamNames].sort(() => 0.5 - Math.random());
            const t1 = players.slice(0, players.length / 2);
            const t2 = players.slice(players.length / 2);

            try {
                // Tạo kênh Voice Đội 1
                const vc1 = await msg.guild.channels.create({
                    name: `🔊 ĐỘI ${rN[0]} [#${mId}]`,
                    type: ChannelType.GuildVoice,
                    parent: CONFIG.CATEGORY_VOICE_ID,
                    permissionOverwrites: [
                        { id: msg.guild.id, deny: [PermissionsBitField.Flags.Connect] },
                        ...t1.map(p => ({ id: p.id, allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] }))
                    ]
                });

                // Tạo kênh Voice Đội 2
                const vc2 = await msg.guild.channels.create({
                    name: `🔊 ĐỘI ${rN[1]} [#${mId}]`,
                    type: ChannelType.GuildVoice,
                    parent: CONFIG.CATEGORY_VOICE_ID,
                    permissionOverwrites: [
                        { id: msg.guild.id, deny: [PermissionsBitField.Flags.Connect] },
                        ...t2.map(p => ({ id: p.id, allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] }))
                    ]
                });
                
                activeMatches.push({ id: mId, t1Name: rN[0], t2Name: rN[1], t1P: t1, t2P: t2, voices: [vc1.id, vc2.id] });

                const matchEmbed = new EmbedBuilder()
                    .setTitle(`⚔️ TRẬN ĐẤU BẮT ĐẦU | ID: #${mId}`)
                    .addFields(
                        { name: `🟦 ĐỘI ${rN[0]}`, value: t1.map(p => `• **${p.name}**`).join('\n'), inline: true },
                        { name: `🟥 ĐỘI ${rN[1]}`, value: t2.map(p => `• **${p.name}**`).join('\n'), inline: true }
                    )
                    .setImage(CONFIG.BANNER_URL)
                    .setColor(CONFIG.COLOR.GOLD)
                    .setFooter({ text: "Vui lòng kiểm tra DM hoặc kênh Voice!" });

                msg.channel.send({ content: "@everyone", embeds: [matchEmbed] });

                // Hàm thông báo và di chuyển người chơi
                const notifyPlayers = async (pList, vc) => {
                    for (const p of pList) {
                        const member = await msg.guild.members.fetch(p.id).catch(() => null);
                        if (member) {
                            const dmEmbed = new EmbedBuilder()
                                .setTitle("🛡️ PRIMEBLOX MATCH NOTIFY")
                                .setDescription(`Trận đấu **#${mId}** đã sẵn sàng!\n\n🔗 **LINK SERVER VIP:** [THAM GIA NGAY](${CONFIG.VIP_LINK})\n🔊 **PHÒNG VOICE:** ${vc.url}`)
                                .setColor(CONFIG.COLOR.SUCCESS)
                                .setTimestamp();
                            
                            // Thử gửi DM, nếu không được thì fallback ở kênh chat
                            try {
                                await member.send({ embeds: [dmEmbed] });
                            } catch (e) {
                                const alert = await msg.channel.send(`⚠️ <@${p.id}>: Tôi không thể DM bạn! Link VIP: <${CONFIG.VIP_LINK}>`);
                                setTimeout(() => alert.delete().catch(() => {}), 60000);
                            }

                            // Tự động kéo vào Voice
                            if (member.voice.channel) {
                                member.voice.setChannel(vc).catch(() => {});
                            }
                        }
                    }
                };

                await notifyPlayers(t1, vc1);
                await notifyPlayers(t2, vc2);

            } catch (err) {
                console.error("Lỗi Matchmaking:", err);
                msg.channel.send("❌ Đã xảy ra lỗi khi tạo trận đấu. Vui lòng thử lại!");
            }
        }
    }

    // --- LỆNH XÁC NHẬN THẮNG (ADMIN ONLY) ---
    if (command === 'win') {
        if (!msg.member.roles.cache.has(CONFIG.ADMIN_ROLE_ID)) {
            return msg.reply("🚫 Bạn không có quyền sử dụng lệnh này!");
        }

        const mId = parseInt(args[0]);
        const winTeam = args[1]?.toUpperCase();
        if (!mId || !winTeam) return msg.reply("⚠️ Cách dùng: `!win [ID_Trận] [Tên_Đội]`");

        const matchIdx = activeMatches.findIndex(m => m.id === mId);
        if (matchIdx === -1) return msg.reply("❌ Không tìm thấy trận đấu với ID này!");

        const match = activeMatches[matchIdx];
        const isT1Winner = winTeam === match.t1Name;
        const winners = isT1Winner ? match.t1P : match.t2P;
        const losers = isT1Winner ? match.t2P : match.t1P;

        // Cập nhật ELO và Streak
        for (const p of winners) {
            await pool.execute('UPDATE users SET elo = elo + ?, wins = wins + 1, streak = IF(streak < 0, 1, streak + 1) WHERE discordId = ?', [CONFIG.ELO.GAIN, p.id]);
        }
        for (const p of losers) {
            await pool.execute('UPDATE users SET elo = elo - ?, losses = losses + 1, streak = IF(streak > 0, -1, streak - 1) WHERE discordId = ?', [CONFIG.ELO.LOSS, p.id]);
        }

        const resEmbed = new EmbedBuilder()
            .setTitle(`🏁 KẾT QUẢ TRẬN #${mId}`)
            .setDescription(`Admin **${msg.author.username}** đã xác nhận chiến thắng!`)
            .addFields(
                { name: "🏆 ĐỘI THẮNG", value: winners.map(p => `• ${p.name} (+${CONFIG.ELO.GAIN} ELO)`).join('\n'), inline: true },
                { name: "💀 ĐỘI THUA", value: losers.map(p => `• ${p.name} (-${CONFIG.ELO.LOSS} ELO)`).join('\n'), inline: true }
            )
            .setColor(CONFIG.COLOR.GOLD);
        
        msg.channel.send({ embeds: [resEmbed] });

        // Xóa kênh Voice
        for (const vId of match.voices) {
            const ch = await msg.guild.channels.fetch(vId).catch(() => null);
            if (ch) await ch.delete().catch(() => {});
        }

        activeMatches.splice(matchIdx, 1);
        updateAutoLB();
        sendLog("KẾT THÚC TRẬN", `Trận #${mId} đã hoàn tất. Đội thắng: ${winTeam}`, CONFIG.COLOR.INFO);
    }

    // --- LỆNH XEM THÔNG TIN CÁ NHÂN ---
    if (command === 'stats') {
        const [r] = await pool.execute('SELECT * FROM users WHERE discordId = ?', [msg.author.id]);
        if (!r[0]) return msg.reply("❌ Bạn chưa xác minh tài khoản!");

        const winrate = (r[0].wins + r[0].losses) === 0 ? "0%" : ((r[0].wins / (r[0].wins + r[0].losses)) * 100).toFixed(1) + "%";
        
        const embed = new EmbedBuilder()
            .setAuthor({ name: `Hồ sơ cá nhân: ${r[0].robloxName}`, iconURL: msg.author.displayAvatarURL() })
            .setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${r[0].robloxId}&width=420&height=420&format=png`)
            .addFields(
                { name: "📊 HẠNG", value: `\`${getRankTier(r[0].elo)}\``, inline: true },
                { name: "📈 ELO", value: `\`${r[0].elo}\``, inline: true },
                { name: "🔥 CHUỖI", value: `\`${r[0].streak}\``, inline: true },
                { name: "📉 THỐNG KÊ", value: `Thắng: **${r[0].wins}** | Thua: **${r[0].losses}** | Tỷ lệ: **${winrate}**` }
            )
            .setColor(CONFIG.COLOR.PURPLE);
        msg.reply({ embeds: [embed] });
    }
});

// --- XỬ LÝ NÚT BẤM VÀ MODAL (VERIFICATION) ---
client.on('interactionCreate', async (i) => {
    if (i.isButton()) {
        const [user] = await pool.execute('SELECT * FROM users WHERE discordId = ?', [i.user.id]);
        
        // XỬ LÝ NÚT XÁC MINH
        if (i.customId === 'v_start') {
            if (user.length > 0) return i.reply({ content: `⚠️ Bạn đã liên kết với tài khoản **${user[0].robloxName}**. Vui lòng dùng **Unlink** nếu muốn đổi tài khoản!`, ephemeral: true });
            
            const modal = new ModalBuilder().setCustomId('m_v').setTitle('HỆ THỐNG XÁC MINH');
            const input = new TextInputBuilder().setCustomId('r_u').setLabel("NHẬP TÊN TÀI KHOẢN ROBLOX CỦA BẠN").setStyle(TextInputStyle.Short).setMinLength(3).setMaxLength(20).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await i.showModal(modal);
        }

        // XỬ LÝ NÚT UNLINK
        if (i.customId === 'v_unlink') {
            if (user.length === 0) return i.reply({ content: "❌ Bạn chưa có dữ liệu trên hệ thống!", ephemeral: true });
            
            await pool.execute('DELETE FROM users WHERE discordId = ?', [i.user.id]);
            await i.reply({ content: "🔓 Đã hủy liên kết thành công. Mọi dữ liệu (ELO, Wins, Losses) đã bị xóa sạch!", ephemeral: true });
            sendLog("HỦY LIÊN KẾT", `${i.user.tag} đã xóa tài khoản hệ thống.`, CONFIG.COLOR.ERROR);
        }

        // XỬ LÝ NÚT ĐỔI ACC
        if (i.customId === 'v_change') {
            if (user.length === 0) return i.reply({ content: "❌ Bạn chưa xác minh! Hãy nhấn nút Xác minh trước.", ephemeral: true });
            
            const modal = new ModalBuilder().setCustomId('m_c').setTitle('ĐỔI TÊN TÀI KHOẢN');
            const input = new TextInputBuilder().setCustomId('r_u_new').setLabel("TÊN ROBLOX MỚI").setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await i.showModal(modal);
        }
    }

    // XỬ LÝ KHI GỬI MODAL
    if (i.type === InteractionType.ModalSubmit) {
        await i.deferReply({ ephemeral: true });
        const rName = i.fields.getTextInputValue(i.customId === 'm_v' ? 'r_u' : 'r_u_new');

        try {
            const rId = await nblox.getIdFromUsername(rName);
            
            if (i.customId === 'm_v') {
                await pool.execute('INSERT INTO users (discordId, robloxName, robloxId, elo, wins, losses, streak) VALUES (?, ?, ?, 1000, 0, 0, 0)', [i.user.id, rName, rId.toString()]);
                await i.editReply(`✅ Xác minh thành công! Chào mừng **${rName}** gia nhập hệ thống.`);
            } else {
                await pool.execute('UPDATE users SET robloxName = ?, robloxId = ? WHERE discordId = ?', [rName, rId.toString(), i.user.id]);
                await i.editReply(`🔄 Đã cập nhật tên tài khoản thành **${rName}**.`);
            }
            updateAutoLB();
        } catch (e) {
            await i.editReply("❌ Không tìm thấy tên Roblox này! Vui lòng kiểm tra lại chính tả.");
        }
    }
});

// --- KẾT NỐI BOT ---
client.login(process.env.DISCORD_TOKEN);
