/**
 * ==========================================
 * PRIMEBLOX MULTIPLAYER SYSTEM V5 - ULTIMATE
 * FIX: AUTO-VOICE, DM & PERMISSION GUARD
 * ==========================================
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

// Khởi tạo Client với đầy đủ quyền hạn
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

// --- CẤU HÌNH HỆ THỐNG CHI TIẾT (ĐÃ GẮN ID CỦA BẠN) ---
const CONFIG = {
    ADMIN_ROLE_ID: "1465374336214106237",
    VERIFY_CHANNEL_ID: "1476164329962213477",
    CATEGORY_VOICE_ID: "1476182203653161061", 
    LOG_CHANNEL_ID: "1476182400617680968",
    VIP_LINK: "https://www.roblox.com/vi/games/301549746/Counter-Blox?privateServerLinkCode=56786714113746670670511968107962",
    BANNER_URL: "https://www.dexerto.com/cdn-image/wp-content/uploads/2026/01/22/Counter-Blox-codes.jpg?width=1200&quality=60&format=auto",
    COLOR: {
        SUCCESS: 0x2ecc71,
        ERROR: 0xe74c3c,
        INFO: 0x3498db,
        GOLD: 0xf1c40f
    },
    ELO: { GAIN: 25, LOSS: 20 }
};

// Quản lý trạng thái bộ nhớ tạm
const queues = { 
    "1v1": { players: [], limit: 2 }, 
    "2v2": { players: [], limit: 4 }, 
    "5v5": { players: [], limit: 10 } 
};
let activeMatches = [];
const teamNames = ["ALPHA", "OMEGA", "RADIANT", "DIRE", "STORM", "THUNDER", "TITAN", "PHOENIX", "SHADOW", "GHOST"];

// Kết nối Cơ sở dữ liệu
const pool = mysql.createPool({
    uri: process.env.DATABASE_URL,
    waitForConnections: true,
    connectionLimit: 20,
    ssl: { rejectUnauthorized: false }
});

/**
 * HÀM TIỆN ÍCH
 */
async function sendLog(guild, embed) {
    const logCh = guild.channels.cache.get(CONFIG.LOG_CHANNEL_ID);
    if (logCh) logCh.send({ embeds: [embed] });
}

client.on('ready', async () => {
    console.log(`[SYSTEM] Đang khởi động PrimeBlox...`);
    client.user.setActivity('Tournament Hub', { type: ActivityType.Competing });

    await pool.execute(`
        CREATE TABLE IF NOT EXISTS users (
            discordId VARCHAR(255) PRIMARY KEY, 
            robloxId VARCHAR(255), 
            robloxName VARCHAR(255), 
            elo INT DEFAULT 1000, 
            wins INT DEFAULT 0, 
            losses INT DEFAULT 0,
            joinedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log(`[SYSTEM] Database đã sẵn sàng. Bot Online: ${client.user.tag}`);
});

/**
 * HỆ THỐNG XỬ LÝ LỆNH CHAT
 */
client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.guild) return;
    if (!msg.content.startsWith('!')) return;

    const args = msg.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // --- LỆNH: KHỞI TẠO HỆ THỐNG (Admin) ---
    if (command === 'setup-verify') {
        if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return msg.reply("❌ Bạn cần quyền Administrator để thực hiện việc này.");
        }

        const embed = new EmbedBuilder()
            .setTitle("🔒 PrimeBlox — Account Verification")
            .setDescription("Chào mừng bạn đến với Tournament Hub! Để bắt đầu tham gia đấu hạng, bạn cần thực hiện các bước sau:\n\n" +
                "1️⃣ Nhấn nút **Verify Account** bên dưới.\n" +
                "2️⃣ Nhập chính xác **Roblox Username** của bạn.\n" +
                "3️⃣ Bot sẽ tự động kiểm tra và liên kết tài khoản ngay lập tức.")
            .addFields({ name: "Lưu ý", value: "Tài khoản của bạn sẽ được dùng để tính điểm ELO và xếp hạng." })
            .setColor(CONFIG.COLOR.GOLD)
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('v_start').setLabel('Verify Account').setStyle(ButtonStyle.Success).setEmoji('✅'),
            new ButtonBuilder().setCustomId('v_unlink').setLabel('Unlink Account').setStyle(ButtonStyle.Danger).setEmoji('🔗')
        );

        const verifyMsg = await msg.channel.send({ embeds: [embed], components: [row] });
        await verifyMsg.pin().catch(() => {});
        msg.delete().catch(() => {});
    }

    // --- LỆNH: THAM GIA HÀNG CHỜ ---
    if (command === 'j') {
        const mode = args[0];
        if (!queues[mode]) return msg.reply("⚠️ Định dạng sai! Sử dụng: `!j 1v1`, `!j 2v2` hoặc `!j 5v5`.");

        const [rows] = await pool.execute('SELECT * FROM users WHERE discordId = ?', [msg.author.id]);
        if (!rows[0]) return msg.reply(`❌ Bạn chưa xác minh! Hãy thực hiện tại <#${CONFIG.VERIFY_CHANNEL_ID}>.`);

        const alreadyIn = Object.entries(queues).find(([m, q]) => q.players.some(p => p.id === msg.author.id));
        if (alreadyIn) return msg.reply(`🚫 Bạn đã tham gia hàng chờ **${alreadyIn[0]}** rồi!`);

        queues[mode].players.push({
            id: msg.author.id,
            name: rows[0].robloxName,
            elo: rows[0].elo
        });

        const joinEmbed = new EmbedBuilder()
            .setAuthor({ name: rows[0].robloxName, iconURL: msg.author.displayAvatarURL() })
            .setDescription(`📥 Đã tham gia hàng chờ **${mode}** \`[${queues[mode].players.length}/${queues[mode].limit}]\``)
            .setColor(CONFIG.COLOR.INFO);
        
        msg.channel.send({ embeds: [joinEmbed] });

        // Logic khi hàng chờ ĐỦ NGƯỜI
        if (queues[mode].players.length === queues[mode].limit) {
            const players = [...queues[mode].players].sort(() => 0.5 - Math.random());
            queues[mode].players = []; 

            const mId = Math.floor(100000 + Math.random() * 900000);
            const rN = [...teamNames].sort(() => 0.5 - Math.random());
            const t1 = players.slice(0, players.length / 2);
            const t2 = players.slice(players.length / 2);

            try {
                // HÀM TẠO VOICE AN TOÀN (FIX LỖI)
                const createMatchVoice = async (name) => {
                    return await msg.guild.channels.create({
                        name: name,
                        type: ChannelType.GuildVoice,
                        parent: CONFIG.CATEGORY_VOICE_ID,
                        permissionOverwrites: [
                            { id: msg.guild.id, deny: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] }
                        ]
                    }).catch(async () => {
                        // Fallback nếu sai ID Category
                        return await msg.guild.channels.create({ name: name, type: ChannelType.GuildVoice });
                    });
                };

                const vc1 = await createMatchVoice(`🔊 ${rN[0]} (#${mId})`);
                const vc2 = await createMatchVoice(`🔊 ${rN[1]} (#${mId})`);

                activeMatches.push({ id: mId, mode, t1Name: rN[0], t2Name: rN[1], t1P: t1, t2P: t2, voices: [vc1.id, vc2.id] });

                const matchEmbed = new EmbedBuilder()
                    .setTitle(`⚔️ MATCH FOUND | #${mId}`)
                    .setImage(CONFIG.BANNER_URL)
                    .addFields(
                        { name: `🟦 TEAM ${rN[0]}`, value: t1.map(p => `• ${p.name} (${p.elo})`).join('\n'), inline: true },
                        { name: `🟥 TEAM ${rN[1]}`, value: t2.map(p => `• ${p.name} (${p.elo})`).join('\n'), inline: true }
                    )
                    .setFooter({ text: `Mode: ${mode} | Check DM để lấy link!` })
                    .setColor(CONFIG.COLOR.GOLD);

                msg.channel.send({ content: "@everyone", embeds: [matchEmbed] });

                // GỬI DM VỚI LOGIC FETCH MỚI NHẤT
                const dmEmbed = new EmbedBuilder()
                    .setTitle("🛡️ ĐẾN GIỜ CHIẾN ĐẤU!")
                    .setDescription(`Bạn đã được xếp trận #${mId}. Hãy tham gia ngay!`)
                    .addFields(
                        { name: "🔊 Voice Team", value: `${vc1.url}` },
                        { name: "🔗 Link VIP", value: `[Bấm vào đây](${CONFIG.VIP_LINK})` }
                    )
                    .setColor(CONFIG.COLOR.SUCCESS);

                for (const p of players) {
                    const member = await client.users.fetch(p.id).catch(() => null);
                    if (member) {
                        await member.send({ embeds: [dmEmbed] }).catch(() => {
                            msg.channel.send(`⚠️ Không thể DM cho <@${p.id}>. Hãy check link VIP tại tin nhắn ghim!`);
                        });
                    }
                }

                // Cấp quyền Voice ngay lập tức cho người trong trận
                const grantPerms = async (vId, pList) => {
                    const channel = await msg.guild.channels.fetch(vId).catch(() => null);
                    if (channel) {
                        for(const p of pList) {
                            await channel.permissionOverwrites.edit(p.id, { Connect: true, ViewChannel: true });
                        }
                    }
                };
                await grantPerms(vc1.id, t1); await grantPerms(vc2.id, t2);

            } catch (err) {
                console.error("Lỗi tạo trận:", err);
                msg.reply("❌ Lỗi hệ thống khi tạo phòng. Hãy liên hệ Admin.");
            }
        }
    }

    // --- LỆNH: XÁC NHẬN KẾT QUẢ ---
    if (command === 'win') {
        if (!msg.member.roles.cache.has(CONFIG.ADMIN_ROLE_ID)) return msg.reply("❌ Bạn không có quyền kết thúc trận đấu.");

        const mId = parseInt(args[0]);
        const winnerTeam = args[1]?.toUpperCase();
        const score = args[2] || "N/A";

        const matchIdx = activeMatches.findIndex(m => m.id === mId);
        if (matchIdx === -1) return msg.reply("❌ ID trận đấu không tồn tại!");

        const match = activeMatches[matchIdx];
        const winners = (winnerTeam === match.t1Name) ? match.t1P : match.t2P;
        const losers = (winnerTeam === match.t1Name) ? match.t2P : match.t1P;

        for (const p of winners) {
            await pool.execute('UPDATE users SET elo = elo + ?, wins = wins + 1 WHERE discordId = ?', [CONFIG.ELO.GAIN, p.id]);
        }
        for (const p of losers) {
            await pool.execute('UPDATE users SET elo = elo - ?, losses = losses + 1 WHERE discordId = ?', [CONFIG.ELO.LOSS, p.id]);
        }

        const resEmbed = new EmbedBuilder()
            .setTitle(`🏁 TRẬN ĐẤU KẾT THÚC | #${mId}`)
            .addFields(
                { name: `🏆 THẮNG: TEAM ${winnerTeam}`, value: winners.map(p => `\`${p.name}\` (+${CONFIG.ELO.GAIN})`).join('\n'), inline: true },
                { name: `💀 THUA`, value: losers.map(p => `\`${p.name}\` (-${CONFIG.ELO.LOSS})`).join('\n'), inline: true },
                { name: "📊 Tỉ số", value: `\`${score}\`` }
            )
            .setColor(CONFIG.COLOR.SUCCESS)
            .setTimestamp();

        msg.channel.send({ embeds: [resEmbed] });
        sendLog(msg.guild, resEmbed);

        for (const vId of match.voices) {
            const ch = await msg.guild.channels.fetch(vId).catch(() => null);
            if (ch) await ch.delete().catch(() => {});
        }
        activeMatches.splice(matchIdx, 1);
    }

    // --- THỐNG KÊ & BẢNG XẾP HẠNG ---
    if (command === 'stats') {
        const [r] = await pool.execute('SELECT * FROM users WHERE discordId = ?', [msg.author.id]);
        if (!r[0]) return msg.reply("❌ Bạn chưa xác minh.");
        
        const embed = new EmbedBuilder()
            .setTitle(`📊 THỐNG KÊ: ${r[0].robloxName}`)
            .setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${r[0].robloxId}&width=420&height=420&format=png`)
            .addFields(
                { name: "⭐ ELO", value: `\`${r[0].elo}\``, inline: true },
                { name: "⚔️ Trận thắng", value: `\`${r[0].wins}\``, inline: true },
                { name: "📉 Trận thua", value: `\`${r[0].losses}\``, inline: true }
            )
            .setColor(CONFIG.COLOR.INFO);
        msg.reply({ embeds: [embed] });
    }

    if (command === 'lb') {
        const [top] = await pool.execute('SELECT robloxName, elo FROM users ORDER BY elo DESC LIMIT 10');
        const list = top.map((u, i) => `**#${i+1}** \`${u.robloxName}\` — ${u.elo} ELO`).join('\n');
        msg.reply({ embeds: [new EmbedBuilder().setTitle("🏆 TOP 10 CAO THỦ").setDescription(list || "Chưa có dữ liệu.").setColor(CONFIG.COLOR.GOLD)] });
    }

    if (command === 'leave') {
        for (const m in queues) {
            const idx = queues[m].players.findIndex(p => p.id === msg.author.id);
            if (idx !== -1) {
                queues[m].players.splice(idx, 1);
                return msg.reply(`👋 Đã rời khỏi hàng chờ **${m}**.`);
            }
        }
        msg.reply("⚠️ Bạn không ở trong hàng chờ nào.");
    }
});

/**
 * XỬ LÝ VERIFY (BUTTON & MODAL)
 */
client.on('interactionCreate', async (i) => {
    if (i.isButton()) {
        if (i.customId === 'v_start') {
            const [r] = await pool.execute('SELECT discordId FROM users WHERE discordId = ?', [i.user.id]);
            if (r[0]) return i.reply({ content: "⚠️ Bạn đã xác minh rồi!", ephemeral: true });

            const modal = new ModalBuilder().setCustomId('modal_v').setTitle('PrimeBlox Verification');
            const input = new TextInputBuilder().setCustomId('r_user').setLabel("Nhập Roblox Username").setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await i.showModal(modal);
        }
        if (i.customId === 'v_unlink') {
            await pool.execute('DELETE FROM users WHERE discordId = ?', [i.user.id]);
            await i.reply({ content: "🔗 Đã hủy liên kết thành công.", ephemeral: true });
        }
    }

    if (i.type === InteractionType.ModalSubmit && i.customId === 'modal_v') {
        const rName = i.fields.getTextInputValue('r_user');
        await i.deferReply({ ephemeral: true });
        try {
            const rId = await nblox.getIdFromUsername(rName);
            await pool.execute('INSERT INTO users (discordId, robloxName, robloxId) VALUES (?, ?, ?)', [i.user.id, rName, rId.toString()]);
            await i.editReply({ embeds: [new EmbedBuilder().setTitle("✅ XÁC MINH THÀNH CÔNG").setDescription(`Chào mừng **${rName}**!`).setColor(CONFIG.COLOR.SUCCESS)] });
        } catch (e) {
            await i.editReply("❌ Không tìm thấy Username Roblox này!");
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
