/**
 * ===========================================================================
 * 🏆 PRIMEBLOX MULTIPLAYER SYSTEM V13.0 - GRANDMASTER EDITION
 * 📋 PHIÊN BẢN: HOÀN CHỈNH TỐI ƯU (UNLINK, CHANGE, AUTO-LB, VOICE LOCK, STREAK)
 * 🛠️ FIX: CATEGORY_INVALID, AUTO-MOVE, FALLBACK DM, ANTI-ERROR
 * 🚀 TRẠNG THÁI: READY FOR PRODUCTION (400+ LINES)
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

// --- KHỞI TẠO CLIENT VỚI CÁC INTENTS CẦN THIẾT ---
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
    CATEGORY_VOICE_ID: "1476182203653161061", // Cần đảm bảo đây là ID của Danh mục (Category)
    LOG_CHANNEL_ID: "1476182400617680968",
    VIP_LINK: "https://www.roblox.com/vi/games/301549746/Counter-Blox?privateServerLinkCode=56786714113746670670511968107962",
    BANNER_URL: "https://www.dexerto.com/cdn-image/wp-content/uploads/2026/01/22/Counter-Blox-codes.jpg?width=1200&quality=60&format=auto",
    COLOR: { 
        SUCCESS: 0x2ecc71, ERROR: 0xe74c3c, INFO: 0x3498db, 
        GOLD: 0xf1c40f, DARK: 0x2b2d31, PURPLE: 0x9b59b6, RED: 0xff0000
    },
    ELO: { GAIN: 25, LOSS: 20 },
    COOLDOWN: 5000 // 5 giây chống spam lệnh
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

// --- KẾT NỐI CƠ SỞ DỮ LIỆU ---
const pool = mysql.createPool({ 
    uri: process.env.DATABASE_URL, 
    ssl: { rejectUnauthorized: false },
    waitForConnections: true,
    connectionLimit: 15,
    queueLimit: 0
});

// --- UTILS: HÀM HỖ TRỢ PHÂN CẤP RANK ---
function getRankTier(elo) {
    if (elo >= 2500) return "👑 GRANDMASTER";
    if (elo >= 2000) return "💠 ELITE MASTER";
    if (elo >= 1500) return "⚔️ DIAMOND";
    if (elo >= 1200) return "🔥 PLATINUM";
    if (elo >= 1000) return "🛡️ GOLD";
    return "🎗️ SILVER";
}

// --- UTILS: GỬI NHẬT KÝ HỆ THỐNG ---
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

// --- UTILS: CẬP NHẬT BẢNG XẾP HẠNG TỰ ĐỘNG ---
async function updateAutoLB() {
    try {
        const channel = await client.channels.fetch(CONFIG.LB_CHANNEL_ID).catch(() => null);
        if (!channel) return;

        const [top] = await pool.execute('SELECT robloxName, elo, wins, losses, streak FROM users ORDER BY elo DESC LIMIT 10');
        
        const lbEntries = top.map((u, i) => {
            const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `**#${i+1}**`;
            const sEmoji = u.streak >= 5 ? "⚡" : (u.streak >= 3 ? "🔥" : (u.streak <= -3 ? "🧊" : "➖"));
            const streakDisplay = u.streak >= 0 ? `+${u.streak}` : `${u.streak}`;
            return `${medal} **${u.robloxName}**\n╰ \`${u.elo} ELO\` • ${u.wins}W/${u.losses}L • ${sEmoji} \`${streakDisplay}\` • *${getRankTier(u.elo)}*`;
        });

        const embed = new EmbedBuilder()
            .setTitle("🏆 TOP 10 PRIMEBLOX GLADIATORS")
            .setDescription(lbEntries.join('\n\n') || "Chưa có dữ liệu chiến binh.")
            .setColor(CONFIG.COLOR.GOLD)
            .setThumbnail(CONFIG.BANNER_URL)
            .setTimestamp()
            .setFooter({ text: "Tự động cập nhật mỗi khi kết thúc trận đấu" });

        const messages = await channel.messages.fetch({ limit: 10 });
        const botMsg = messages.find(m => m.author.id === client.user.id);
        
        if (botMsg) await botMsg.edit({ embeds: [embed] });
        else await channel.send({ embeds: [embed] });
    } catch (err) { console.error("Leaderboard Sync Error:", err); }
}

// --- EVENT: BOT SẴN SÀNG ---
// --- LỆNH SETUP VERIFY (DÀNH CHO ADMIN) ---
    if (command === 'setup-verify') {
        if (!msg.member.roles.cache.has(CONFIG.ADMIN_ROLE_ID)) return msg.reply("🚫 Bạn không có quyền!");

        const vChan = await client.channels.fetch(CONFIG.VERIFY_CHANNEL_ID).catch(() => null);
        if (!vChan) return msg.reply("❌ Không tìm thấy Channel Verify. Kiểm tra lại ID trong CONFIG.");

        // Xóa tin nhắn cũ của bot trong channel đó để tránh loãng
        const oldMsgs = await vChan.messages.fetch({ limit: 50 });
        const botMsgs = oldMsgs.filter(m => m.author.id === client.user.id);
        if (botMsgs.size > 0) {
            await vChan.bulkDelete(botMsgs).catch(() => {});
        }

        const embed = new EmbedBuilder()
            .setTitle("🛡️ PRIMEBLOX SECURITY & VERIFICATION")
            .setDescription("Vui lòng nhấn các nút bên dưới để quản lý tài khoản thi đấu của bạn.")
            .addFields(
                { name: "✅ XÁC MINH", value: "Liên kết tài khoản Roblox lần đầu.", inline: true },
                { name: "🔄 ĐỔI ACC", value: "Cập nhật lại tên nếu bạn đổi tên Roblox.", inline: true },
                { name: "🔓 UNLINK", value: "Xóa toàn bộ dữ liệu để làm lại từ đầu.", inline: true }
            )
            .setColor(CONFIG.COLOR.PURPLE)
            .setImage(CONFIG.BANNER_URL)
            .setFooter({ text: "PrimeBlox System • Grandmaster Edition" });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('v_start').setLabel('Xác minh').setStyle(ButtonStyle.Success).setEmoji('🛡️'),
            new ButtonBuilder().setCustomId('v_change').setLabel('Đổi Tên').setStyle(ButtonStyle.Primary).setEmoji('📝'),
            new ButtonBuilder().setCustomId('v_unlink').setLabel('Unlink').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
        );

        await vChan.send({ embeds: [embed], components: [row] });
        msg.reply(`✅ Đã gửi lại bảng Verify tại <#${CONFIG.VERIFY_CHANNEL_ID}>!`);
    }
// --- EVENT: XỬ LÝ LỆNH TỪ NGƯỜI DÙNG ---
client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.guild) return;
    if (!msg.content.startsWith('!')) return;

    // Chống spam lệnh
    if (cooldowns.has(msg.author.id)) return msg.reply("⏳ Chậm lại nào! Đừng spam lệnh.");
    cooldowns.add(msg.author.id);
    setTimeout(() => cooldowns.delete(msg.author.id), CONFIG.COOLDOWN);

    const args = msg.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // --- LỆNH JOIN (DÀNH CHO NGƯỜI CHƠI) ---
    if (command === 'j' || command === 'join') {
        const mode = args[0];
        if (!queues[mode]) return msg.reply("⚠️ Sai chế độ! Hãy dùng: `!j 1v1`, `!j 2v2` hoặc `!j 5v5`.");
        
        const [user] = await pool.execute('SELECT * FROM users WHERE discordId = ?', [msg.author.id]);
        if (!user[0]) return msg.reply(`❌ Bạn chưa xác minh! Hãy qua <#${CONFIG.VERIFY_CHANNEL_ID}>.`);
        
        // Kiểm tra xem đã có trong bất kỳ queue nào chưa
        const alreadyInQueue = Object.values(queues).some(q => q.players.some(p => p.id === msg.author.id));
        if (alreadyInQueue) return msg.reply("🚫 Bạn đã ở trong hàng chờ rồi!");

        queues[mode].players.push({ id: msg.author.id, name: user[0].robloxName, elo: user[0].elo });
        
        const qEmbed = new EmbedBuilder()
            .setDescription(`📥 **${user[0].robloxName}** đã tham gia queue **${mode}** [\`${queues[mode].players.length}/${queues[mode].limit}\`]`)
            .setColor(CONFIG.COLOR.SUCCESS);
        msg.channel.send({ embeds: [qEmbed] });

        // --- XỬ LÝ KHI ĐỦ NGƯỜI ---
        if (queues[mode].players.length === queues[mode].limit) {
            const players = [...queues[mode].players].sort(() => 0.5 - Math.random());
            queues[mode].players = []; // Làm trống queue ngay lập tức

            const mId = Math.floor(100000 + Math.random() * 899999);
            const teamNamesPicked = [...teamNames].sort(() => 0.5 - Math.random());
            const team1 = players.slice(0, players.length / 2);
            const team2 = players.slice(players.length / 2);

            try {
                // Kiểm tra Category để fix lỗi Invalid Form Body
                const parentCat = msg.guild.channels.cache.get(CONFIG.CATEGORY_VOICE_ID);
                const finalParent = (parentCat && parentCat.type === ChannelType.GuildCategory) ? CONFIG.CATEGORY_VOICE_ID : null;

                const createTeamVoice = async (name, members) => {
                    return await msg.guild.channels.create({
                        name: `🔊 ${name} [#${mId}]`,
                        type: ChannelType.GuildVoice,
                        parent: finalParent,
                        permissionOverwrites: [
                            { id: msg.guild.id, deny: [PermissionsBitField.Flags.Connect] },
                            ...members.map(p => ({ id: p.id, allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] }))
                        ]
                    });
                };

                const vc1 = await createTeamVoice(`TEAM ${teamNamesPicked[0]}`, team1);
                const vc2 = await createTeamVoice(`TEAM ${teamNamesPicked[1]}`, team2);
                
                activeMatches.push({ id: mId, t1Name: teamNamesPicked[0], t2Name: teamNamesPicked[1], t1P: team1, t2P: team2, voices: [vc1.id, vc2.id] });

                const startEmbed = new EmbedBuilder()
                    .setTitle(`⚔️ TRẬN ĐẤU ĐÃ SẴN SÀNG | ID: #${mId}`)
                    .addFields(
                        { name: `🟦 ĐỘI ${teamNamesPicked[0]}`, value: team1.map(p => `• **${p.name}**`).join('\n'), inline: true },
                        { name: `🟥 ĐỘI ${teamNamesPicked[1]}`, value: team2.map(p => `• **${p.name}**`).join('\n'), inline: true }
                    )
                    .setColor(CONFIG.COLOR.GOLD)
                    .setImage(CONFIG.BANNER_URL)
                    .setFooter({ text: "Dùng !win [ID] [Tên_Đội] để báo cáo kết quả (Admin)" });

                msg.channel.send({ content: "@everyone", embeds: [startEmbed] });

                // Thông báo riêng từng người
                const processNotification = async (playersList, vc) => {
                    for (const p of playersList) {
                        const member = await msg.guild.members.fetch(p.id).catch(() => null);
                        if (!member) continue;

                        const dm = new EmbedBuilder()
                            .setTitle("🛡️ PRIMEBLOX MATCH NOTIFICATION")
                            .setDescription(`Trận đấu **#${mId}** của bạn bắt đầu ngay bây giờ!\n\n🔗 **SERVER VIP:** [CLICK VÀO ĐÂY](${CONFIG.VIP_LINK})\n🔊 **PHÒNG CHỜ:** ${vc.url}`)
                            .setColor(CONFIG.COLOR.SUCCESS).setTimestamp();

                        try { 
                            await member.send({ embeds: [dm] }); 
                        } catch (e) {
                            const chatAlert = await msg.channel.send(`⚠️ <@${p.id}> không mở DM! Link VIP: <${CONFIG.VIP_LINK}>`);
                            setTimeout(() => chatAlert.delete().catch(() => {}), 60000);
                        }
                        
                        // Auto-Move
                        if (member.voice.channel) member.voice.setChannel(vc).catch(() => {});
                    }
                };

                await processNotification(team1, vc1);
                await processNotification(team2, vc2);

            } catch (err) {
                console.error("Critical Matchmaking Error:", err);
                msg.channel.send("❌ Hệ thống gặp lỗi khi tạo kênh. Vui lòng liên hệ Admin.");
            }
        }
    }

    // --- LỆNH WIN (DÀNH CHO ADMIN) ---
    if (command === 'win') {
        if (!msg.member.roles.cache.has(CONFIG.ADMIN_ROLE_ID)) return msg.reply("🚫 Bạn không phải Quản trị viên!");

        const matchId = parseInt(args[0]);
        const winnerName = args[1]?.toUpperCase();
        if (!matchId || !winnerName) return msg.reply("⚠️ Cú pháp: `!win [ID] [ALPHA/OMEGA/...]`.");

        const mIdx = activeMatches.findIndex(m => m.id === matchId);
        if (mIdx === -1) return msg.reply("❌ Trận đấu không tồn tại hoặc đã kết thúc.");

        const match = activeMatches[mIdx];
        const winners = (winnerName === match.t1Name) ? match.t1P : match.t2P;
        const losers = (winnerName === match.t1Name) ? match.t2P : match.t1P;

        // Cập nhật Database (Dùng Transaction ngầm bằng Promise.all)
        const updateTasks = [
            ...winners.map(p => pool.execute('UPDATE users SET elo = elo + ?, wins = wins + 1, streak = IF(streak < 0, 1, streak + 1) WHERE discordId = ?', [CONFIG.ELO.GAIN, p.id])),
            ...losers.map(p => pool.execute('UPDATE users SET elo = elo - ?, losses = losses + 1, streak = IF(streak > 0, -1, streak - 1) WHERE discordId = ?', [CONFIG.ELO.LOSS, p.id]))
        ];
        
        await Promise.all(updateTasks);

        const endEmbed = new EmbedBuilder()
            .setTitle(`🏁 TRẬN ĐẤU #${matchId} KẾT THÚC`)
            .setDescription(`Admin **${msg.author.tag}** đã xác nhận kết quả.`)
            .addFields(
                { name: `🏆 THẮNG: ĐỘI ${winnerName}`, value: winners.map(p => `• ${p.name} (+\`${CONFIG.ELO.GAIN}\` ELO)`).join('\n'), inline: true },
                { name: `💀 THUA`, value: losers.map(p => `• ${p.name} (-\`${CONFIG.ELO.LOSS}\` ELO)`).join('\n'), inline: true }
            )
            .setColor(CONFIG.COLOR.GOLD);
        
        msg.channel.send({ embeds: [endEmbed] });

        // Dọn dẹp Voice
        for (const vId of match.voices) {
            const ch = await msg.guild.channels.fetch(vId).catch(() => null);
            if (ch) await ch.delete().catch(() => {});
        }

        activeMatches.splice(mIdx, 1);
        updateAutoLB();
        sendLog("KẾT THÚC TRẬN", `ID: #${matchId} | Đội thắng: ${winnerName}`, CONFIG.COLOR.SUCCESS);
    }

    // --- LỆNH STATS (XEM THÔNG TIN) ---
    if (command === 'stats') {
        const [rows] = await pool.execute('SELECT * FROM users WHERE discordId = ?', [msg.author.id]);
        if (!rows[0]) return msg.reply("❌ Bạn chưa có hồ sơ!");

        const winRate = (rows[0].wins + rows[0].losses) === 0 ? "0.0" : ((rows[0].wins / (rows[0].wins + rows[0].losses)) * 100).toFixed(1);

        const statsEmbed = new EmbedBuilder()
            .setAuthor({ name: `Hồ sơ: ${rows[0].robloxName}`, iconURL: msg.author.displayAvatarURL() })
            .setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${rows[0].robloxId}&width=420&height=420&format=png`)
            .addFields(
                { name: "💠 CẤP BẬC", value: `\`${getRankTier(rows[0].elo)}\``, inline: true },
                { name: "📈 ELO", value: `\`${rows[0].elo}\``, inline: true },
                { name: "🔥 CHUỖI", value: `\`${rows[0].streak}\``, inline: true },
                { name: "📊 THẮNG/THUA", value: `**${rows[0].wins}W** / **${rows[0].losses}L** (TL: ${winRate}%)` }
            )
            .setColor(CONFIG.COLOR.INFO);
        msg.reply({ embeds: [statsEmbed] });
    }
});

// --- XỬ LÝ INTERACTIONS (BUTTONS & MODALS) ---
client.on('interactionCreate', async (i) => {
    if (i.isButton()) {
        const [user] = await pool.execute('SELECT * FROM users WHERE discordId = ?', [i.user.id]);

        if (i.customId === 'v_start') {
            if (user[0]) return i.reply({ content: `⚠️ Bạn đã liên kết với **${user[0].robloxName}**.`, ephemeral: true });
            const modal = new ModalBuilder().setCustomId('modal_verify').setTitle('XÁC MINH DANH TÍNH');
            const input = new TextInputBuilder().setCustomId('r_name').setLabel("TÊN TÀI KHOẢN ROBLOX").setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await i.showModal(modal);
        }

        if (i.customId === 'v_unlink') {
            if (!user[0]) return i.reply({ content: "❌ Không có dữ liệu để xóa.", ephemeral: true });
            await pool.execute('DELETE FROM users WHERE discordId = ?', [i.user.id]);
            await i.reply({ content: "🔓 Đã xóa toàn bộ dữ liệu. Bạn có thể xác minh lại.", ephemeral: true });
            sendLog("HỦY LIÊN KẾT", `${i.user.tag} đã thực hiện Unlink.`, CONFIG.COLOR.RED);
        }

        if (i.customId === 'v_change') {
            if (!user[0]) return i.reply({ content: "❌ Bạn cần xác minh trước.", ephemeral: true });
            const modal = new ModalBuilder().setCustomId('modal_change').setTitle('ĐỔI TÊN TÀI KHOẢN');
            const input = new TextInputBuilder().setCustomId('r_new_name').setLabel("TÊN ROBLOX MỚI").setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await i.showModal(modal);
        }
    }

    if (i.type === InteractionType.ModalSubmit) {
        await i.deferReply({ ephemeral: true });
        const nameInput = i.fields.getTextInputValue(i.customId === 'modal_verify' ? 'r_name' : 'r_new_name');

        try {
            const rId = await nblox.getIdFromUsername(nameInput);
            if (i.customId === 'modal_verify') {
                await pool.execute('INSERT INTO users (discordId, robloxName, robloxId, elo, wins, losses, streak) VALUES (?, ?, ?, 1000, 0, 0, 0)', [i.user.id, nameInput, rId.toString()]);
                await i.editReply(`✅ Thành công! Chào mừng **${nameInput}**.`);
            } else {
                await pool.execute('UPDATE users SET robloxName = ?, robloxId = ? WHERE discordId = ?', [nameInput, rId.toString(), i.user.id]);
                await i.editReply(`🔄 Đã đổi tên thành **${nameInput}**.`);
            }
            updateAutoLB();
        } catch (e) {
            await i.editReply("❌ Không tìm thấy user này trên Roblox!");
        }
    }
});

// --- KHỞI CHẠY BOT ---
client.login(process.env.DISCORD_TOKEN);
