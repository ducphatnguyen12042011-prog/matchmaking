const { 
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, 
    TextInputStyle, InteractionType, PermissionsBitField, ChannelType 
} = require('discord.js');
const mysql = require('mysql2/promise');
const nblox = require('noblox.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildVoiceStates
    ]
});

/** * --- HỆ THỐNG CẤU HÌNH (CONFIG) ---
 * Bạn hãy điền chính xác các ID bên dưới để Bot hoạt động.
 */
const CONFIG = {
    ADMIN_ROLE_ID: "1465374336214106237",
    VERIFY_CHANNEL_ID: "1476164329962213477",
    CATEGORY_VOICE_ID: "ID_DANH_MUC_CUA_BAN", 
    LOG_CHANNEL_ID: "ID_KENH_LOG_KET_QUA",
    VIP_LINK: "https://www.roblox.com/vi/games/301549746/Counter-Blox?privateServerLinkCode=56786714113746670670511968107962",
    BANNER_URL: "https://i.imgur.com/your-cbam-banner.png",
    ELO_GAIN: 25,
    ELO_LOSS: 20
};

// Quản lý hàng chờ và trận đấu
const queues = { 
    "1v1": { players: [], limit: 2 }, 
    "2v2": { players: [], limit: 4 }, 
    "5v5": { players: [], limit: 10 } 
};
let activeMatches = [];
const teamNames = ["ALPHA", "OMEGA", "RADIANT", "DIRE", "STORM", "THUNDER", "TITAN", "PHOENIX", "SHADOW", "GHOST"];

// Khởi tạo kết nối Database
const pool = mysql.createPool({
    uri: process.env.DATABASE_URL,
    waitForConnections: true,
    connectionLimit: 15,
    ssl: { rejectUnauthorized: false }
});

client.on('ready', async () => {
    console.log(`
    -------------------------------------------
    🚀 PRIMEBLOX MULTIPLAYER SYSTEM IS ONLINE!
    🤖 Bot: ${client.user.tag}
    📅 Date: ${new Date().toLocaleString()}
    -------------------------------------------
    `);
    
    await pool.execute(`
        CREATE TABLE IF NOT EXISTS users (
            discordId VARCHAR(255) PRIMARY KEY, 
            robloxId VARCHAR(255), 
            robloxName VARCHAR(255), 
            elo INT DEFAULT 1000, 
            wins INT DEFAULT 0, 
            losses INT DEFAULT 0
        )
    `);
});

// --- XỬ LÝ LỆNH CHAT ---
client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.content.startsWith('!')) return;

    const args = msg.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // 1. Lệnh tham gia Queue (!j 1v1, !j 2v2...)
    if (command === 'j') {
        const mode = args[0];
        if (!queues[mode]) return msg.reply("⚠️ Định dạng sai! Sử dụng: `!j 1v1`, `!j 2v2` hoặc `!j 5v5`.");

        const [rows] = await pool.execute('SELECT * FROM users WHERE discordId = ?', [msg.author.id]);
        if (!rows[0] || !rows[0].robloxId) return msg.reply(`❌ Bạn chưa xác minh tài khoản! Hãy thực hiện tại <#${CONFIG.VERIFY_CHANNEL_ID}>.`);

        const isBusy = Object.values(queues).some(q => q.players.find(p => p.id === msg.author.id));
        if (isBusy) return msg.reply("🚫 Bạn đã có tên trong một hàng chờ khác rồi!");

        queues[mode].players.push({ 
            id: msg.author.id, 
            name: rows[0].robloxName, 
            elo: rows[0].elo 
        });

        const qEmbed = new EmbedBuilder()
            .setDescription(`✅ **${rows[0].robloxName}** đã tham gia hàng chờ **${mode}** \`[${queues[mode].players.length}/${queues[mode].limit}]\``)
            .setColor(0x00AE86);
        msg.channel.send({ embeds: [qEmbed] });

        // Khi hàng chờ đủ người
        if (queues[mode].players.length === queues[mode].limit) {
            const players = [...queues[mode].players].sort(() => 0.5 - Math.random());
            queues[mode].players = []; // Reset queue

            const matchId = Math.floor(100000 + Math.random() * 900000);
            const rN = [...teamNames].sort(() => 0.5 - Math.random());
            const t1 = players.slice(0, players.length / 2);
            const t2 = players.slice(players.length / 2);

            // Tạo Voice Channels tự động
            const guild = msg.guild;
            const vc1 = await guild.channels.create({ name: `🔊 ${rN[0]} (#${matchId})`, type: ChannelType.GuildVoice, parent: CONFIG.CATEGORY_VOICE_ID });
            const vc2 = await guild.channels.create({ name: `🔊 ${rN[1]} (#${matchId})`, type: ChannelType.GuildVoice, parent: CONFIG.CATEGORY_VOICE_ID });

            activeMatches.push({ id: matchId, mode, t1Name: rN[0], t2Name: rN[1], t1P: t1, t2P: t2, voices: [vc1.id, vc2.id] });

            const matchEmbed = new EmbedBuilder()
                .setTitle(`⚔️ TRẬN ĐẤU MỚI | ID: #${matchId}`)
                .setImage(CONFIG.BANNER_URL)
                .setColor(0xFFAA00)
                .addFields(
                    { name: `🟦 TEAM ${rN[0]}`, value: t1.map(p => `• ${p.name} (${p.elo})`).join('\n'), inline: true },
                    { name: `🟥 TEAM ${rN[1]}`, value: t2.map(p => `• ${p.name} (${p.elo})`).join('\n'), inline: true },
                    { name: '🎮 Chế độ', value: `\`Competitive ${mode}\``, inline: false }
                )
                .setFooter({ text: "Hệ thống sẽ tự động khóa Voice sau 5 phút!" });

            msg.channel.send({ content: "@everyone", embeds: [matchEmbed] });

            // Gửi DM thông tin trận đấu
            const dmEmbed = new EmbedBuilder()
                .setTitle("🎮 TRẬN ĐẤU BẮT ĐẦU!")
                .setDescription(`Nhanh chóng tham gia phòng Voice và Server VIP.`)
                .addFields({ name: '🔊 Voice', value: `${vc1.url}`, inline: true }, { name: '🔗 Link VIP', value: `[BẤM VÀO ĐÂY](${CONFIG.VIP_LINK})`, inline: true })
                .setColor(0x2ecc71);

            players.forEach(async (p) => {
                const user = await client.users.fetch(p.id).catch(() => null);
                if (user) user.send({ embeds: [dmEmbed] }).catch(() => console.log("Không thể DM người chơi."));
            });

            // Logic khóa Voice Channel
            setTimeout(async () => {
                const lockChannel = async (vId, pList) => {
                    const channel = await guild.channels.fetch(vId).catch(() => null);
                    if (channel) {
                        await channel.permissionOverwrites.set([
                            { id: guild.id, deny: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] },
                            ...pList.map(p => ({ id: p.id, allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] }))
                        ]);
                    }
                };
                await lockChannel(vc1.id, t1); await lockChannel(vc2.id, t2);
            }, 5 * 60 * 1000);
        }
    }

    // 2. Lệnh rời hàng chờ (!leave)
    if (command === 'leave') {
        let found = false;
        for (const mode in queues) {
            const index = queues[mode].players.findIndex(p => p.id === msg.author.id);
            if (index !== -1) {
                queues[mode].players.splice(index, 1);
                found = true;
                msg.reply(`👋 Bạn đã rời khỏi hàng chờ **${mode}**.`);
                break;
            }
        }
        if (!found) msg.reply("⚠️ Bạn hiện không ở trong bất kỳ hàng chờ nào.");
    }

    // 3. Lệnh xem chỉ số cá nhân (!stats)
    if (command === 'stats') {
        const [rows] = await pool.execute('SELECT * FROM users WHERE discordId = ?', [msg.author.id]);
        if (!rows[0]) return msg.reply("❌ Bạn chưa xác minh! Hãy dùng nút Verify.");

        const statsEmbed = new EmbedBuilder()
            .setTitle(`🏅 THÔNG TIN NGƯỜI CHƠI: ${rows[0].robloxName}`)
            .setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${rows[0].robloxId}&width=420&height=420&format=png`)
            .addFields(
                { name: '⭐ ELO hiện tại', value: `\`${rows[0].elo}\``, inline: true },
                { name: '📊 Thắng/Thua', value: `\`${rows[0].wins}W / ${rows[0].losses}L\``, inline: true },
                { name: '🆔 Roblox ID', value: `\`${rows[0].robloxId}\``, inline: false }
            )
            .setColor(0x3498db)
            .setTimestamp();
        msg.reply({ embeds: [statsEmbed] });
    }

    // 4. Lệnh Bảng xếp hạng (!lb)
    if (command === 'lb') {
        const [top] = await pool.execute('SELECT robloxName, elo FROM users ORDER BY elo DESC LIMIT 10');
        const list = top.map((u, i) => `**#${i + 1}** ${u.robloxName} - \`${u.elo} ELO\``).join('\n');
        
        const lbEmbed = new EmbedBuilder()
            .setTitle("🏆 BẢNG XẾP HẠNG TOP 10 CAO THỦ")
            .setDescription(list || "Chưa có dữ liệu người chơi.")
            .setColor(0xFFD700)
            .setFooter({ text: "Cố gắng leo hạng để nhận quà!" });
        msg.reply({ embeds: [lbEmbed] });
    }

    // 5. Lệnh xác nhận kết quả (!win [ID] [TênTeam] [TỉSố]) - Chỉ Admin
    if (command === 'win') {
        if (!msg.member.roles.cache.has(CONFIG.ADMIN_ROLE_ID)) return msg.reply("❌ Bạn không có quyền thực hiện lệnh này!");

        const mId = parseInt(args[0]);
        const winnerName = args[1]?.toUpperCase();
        const score = args[2] || "N/A";

        const matchIdx = activeMatches.findIndex(m => m.id === mId);
        if (matchIdx === -1) return msg.reply("❌ Không tìm thấy Match ID hợp lệ!");

        const m = activeMatches[matchIdx];
        const winners = (winnerName === m.t1Name) ? m.t1P : m.t2P;
        const losers = (winnerName === m.t1Name) ? m.t2P : m.t1P;

        // Cập nhật Database
        for (const p of winners) await pool.execute('UPDATE users SET elo = elo + ?, wins = wins + 1 WHERE discordId = ?', [CONFIG.ELO_GAIN, p.id]);
        for (const p of losers) await pool.execute('UPDATE users SET elo = elo - ?, losses = losses + 1 WHERE discordId = ?', [CONFIG.ELO_LOSS, p.id]);

        const resEmbed = new EmbedBuilder()
            .setTitle(`🏁 TRẬN ĐẤU KẾT THÚC (#${mId})`)
            .addFields(
                { name: `🏆 CHIẾN THẮNG: TEAM ${winnerName}`, value: winners.map(p => `\`${p.name}\` (+${CONFIG.ELO_GAIN})`).join('\n'), inline: true },
                { name: `💀 THẤT BẠI`, value: losers.map(p => `\`${p.name}\` (-${CONFIG.ELO_LOSS})`).join('\n'), inline: true },
                { name: '📊 Tỉ số', value: `\`\`\`css\n[ ${score} ]\`\`\``, inline: false }
            )
            .setColor(0x2ecc71)
            .setTimestamp();

        msg.channel.send({ embeds: [resEmbed] });

        // Xóa Voice Channels
        for (const vId of m.voices) {
            const ch = await msg.guild.channels.fetch(vId).catch(() => null);
            if (ch) await ch.delete();
        }
        activeMatches.splice(matchIdx, 1);
    }
});

// --- XỬ LÝ XÁC MINH (INTERACTION) ---
client.on('interactionCreate', async (i) => {
    if (i.customId === 'v_start') {
        const [r] = await pool.execute('SELECT robloxId FROM users WHERE discordId = ?', [i.user.id]);
        if (r[0]?.robloxId) return i.reply({ content: "⚠️ Bạn đã xác minh tài khoản từ trước!", ephemeral: true });

        const modal = new ModalBuilder().setCustomId('modal_verify').setTitle('Xác Minh PrimeBlox');
        const input = new TextInputBuilder().setCustomId('r_user').setLabel("Nhập Roblox Username của bạn").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return i.showModal(modal);
    }

    if (i.type === InteractionType.ModalSubmit && i.customId === 'modal_verify') {
        const robloxUser = i.fields.getTextInputValue('r_user');
        await i.deferReply({ ephemeral: true });

        try {
            const robloxId = await nblox.getIdFromUsername(robloxUser);
            if (!robloxId) return i.editReply("❌ Không tìm thấy Username này trên Roblox!");

            await pool.execute('INSERT INTO users (discordId, robloxName, robloxId) VALUES (?, ?, ?)', [i.user.id, robloxUser, robloxId.toString()]);
            await i.editReply(`✅ **Xác minh thành công!** Chào mừng **${robloxUser}** gia nhập đấu trường.`);
        } catch (e) {
            await i.editReply("❌ Lỗi hệ thống: " + e.message);
        }
    }
    
    if (i.customId === 'v_unlink') {
        await pool.execute('DELETE FROM users WHERE discordId = ?', [i.user.id]);
        await i.reply({ content: "🔗 Đã hủy liên kết. Bạn có thể xác minh lại từ đầu.", ephemeral: true });
    }
});

client.login(process.env.DISCORD_TOKEN);
