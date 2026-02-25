/**
 * ============================================================
 * 🏆 PRIMEBLOX MULTIPLAYER SYSTEM V12.6 - SUPER ELITE
 * FULL: AUTO-LB, VOICE LOCK, AUTO-MOVE, STREAK, DM-NOTIFY
 * DEVELOPED FOR: COMPETITIVE COUNTER-BLOX
 * ============================================================
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

// --- CẤU HÌNH HỆ THỐNG ---
const CONFIG = {
    ADMIN_ROLE_ID: "1465374336214106237",
    VERIFY_CHANNEL_ID: "1476202572594548799",
    LB_CHANNEL_ID: "1474674662792232981", 
    CATEGORY_VOICE_ID: "1476182203653161061", 
    LOG_CHANNEL_ID: "1476182400617680968",
    VIP_LINK: "https://www.roblox.com/vi/games/301549746/Counter-Blox?privateServerLinkCode=56786714113746670670511968107962",
    BANNER_URL: "https://www.dexerto.com/cdn-image/wp-content/uploads/2026/01/22/Counter-Blox-codes.jpg?width=1200&quality=60&format=auto",
    THUMB_WIN: "https://i.imgur.com/vHdfCAt.png", // Icon chiến thắng
    THUMB_LOSE: "https://i.imgur.com/uG9V8y9.png", // Icon thất bại
    COLOR: { SUCCESS: 0x2ecc71, ERROR: 0xe74c3c, INFO: 0x3498db, GOLD: 0xf1c40f, DARK: 0x2b2d31 },
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

// --- HÀM CẬP NHẬT BXH TỰ ĐỘNG ---
async function updateAutoLB() {
    try {
        const channel = await client.channels.fetch(CONFIG.LB_CHANNEL_ID).catch(() => null);
        if (!channel) return;

        const [top] = await pool.execute('SELECT robloxName, elo, wins, losses, streak FROM users ORDER BY elo DESC LIMIT 10');
        
        const lbText = top.map((u, i) => {
            const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `**#${i+1}**`;
            const sEmoji = u.streak >= 3 ? "🔥" : (u.streak <= -3 ? "🧊" : "➖");
            return `${medal} **${u.robloxName}**\n╰ \`${u.elo} ELO\` • ${u.wins}W-${u.losses}L • ${sEmoji} \`${u.streak >= 0 ? '+' + u.streak : u.streak}\``;
        }).join('\n\n');

        const embed = new EmbedBuilder()
            .setTitle("🏆 PRIMEBLOX LEADERBOARD - TOP 10")
            .setDescription(`*Cập nhật thời gian thực các chiến binh xuất sắc nhất.*\n\n${lbText || "Chưa có dữ liệu"}`)
            .setColor(CONFIG.COLOR.GOLD)
            .setThumbnail(CONFIG.BANNER_URL)
            .setTimestamp()
            .setFooter({ text: `Hệ thống tự động cập nhật • ${new Date().toLocaleString('vi-VN')}` });

        const messages = await channel.messages.fetch({ limit: 5 });
        const lastBotMsg = messages.find(m => m.author.id === client.user.id);
        
        if (lastBotMsg) await lastBotMsg.edit({ embeds: [embed] });
        else await channel.send({ embeds: [embed] });
    } catch (e) { console.error("LB Update Error:", e); }
}

// --- HÀM GỬI VERIFY ---
async function sendVerifyEmbed(channel) {
    const embed = new EmbedBuilder()
        .setTitle("🛡️ PRIMEBLOX — ACCOUNT VERIFICATION")
        .setDescription("Chào mừng bạn đến với hệ thống Competitive. Nhấn nút bên dưới để xác minh tài khoản Roblox của bạn.")
        .addFields({ name: "Lưu ý", value: "Tên tài khoản phải chính xác để hệ thống đồng bộ ELO." })
        .setColor(CONFIG.COLOR.INFO)
        .setImage(CONFIG.BANNER_URL);
    
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('v_start').setLabel('Xác minh ngay').setStyle(ButtonStyle.Primary).setEmoji('✅')
    );

    const msgs = await channel.messages.fetch({ limit: 10 });
    const oldVerify = msgs.filter(m => m.author.id === client.user.id && m.embeds[0]?.title?.includes("Verification"));
    
    if (oldVerify.size > 0 && msgs.first().id !== oldVerify.first().id) {
        await channel.bulkDelete(oldVerify).catch(() => {});
        await channel.send({ embeds: [embed], components: [row] });
    } else if (oldVerify.size === 0) {
        await channel.send({ embeds: [embed], components: [row] });
    }
}

client.on('ready', async () => {
    console.log(`[SYSTEM] PrimeBlox V12.6 Online: ${client.user.tag}`);
    client.user.setActivity('Ranked Matches', { type: ActivityType.Competing });
    updateAutoLB();
    setInterval(updateAutoLB, 300000); 
});

client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.guild) return;
    if (msg.channel.id === CONFIG.VERIFY_CHANNEL_ID) await sendVerifyEmbed(msg.channel);
    if (!msg.content.startsWith('!')) return;

    const args = msg.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // --- LỆNH JOIN ( !j ) ---
    if (command === 'j') {
        const mode = args[0];
        if (!queues[mode]) return msg.reply("⚠️ Định dạng: `!j 1v1`, `!j 2v2` hoặc `!j 5v5`.");
        
        const [rows] = await pool.execute('SELECT * FROM users WHERE discordId = ?', [msg.author.id]);
        if (!rows[0]) return msg.reply(`❌ Bạn chưa xác minh tài khoản! Hãy thực hiện tại <#${CONFIG.VERIFY_CHANNEL_ID}>.`);
        
        if (Object.values(queues).some(q => q.players.some(p => p.id === msg.author.id))) {
            return msg.reply("🚫 Bạn đã có mặt trong một hàng chờ khác.");
        }

        queues[mode].players.push({ id: msg.author.id, name: rows[0].robloxName, elo: rows[0].elo });
        msg.channel.send({ 
            embeds: [new EmbedBuilder().setDescription(`📥 **${rows[0].robloxName}** (\`${rows[0].elo}\`) đã tham gia hàng chờ **${mode}**`).setColor(CONFIG.COLOR.SUCCESS)] 
        });

        if (queues[mode].players.length === queues[mode].limit) {
            const players = [...queues[mode].players].sort(() => 0.5 - Math.random());
            queues[mode].players = [];
            
            const mId = Math.floor(100000 + Math.random() * 900000);
            const rN = [...teamNames].sort(() => 0.5 - Math.random());
            const t1 = players.slice(0, players.length / 2);
            const t2 = players.slice(players.length / 2);

            try {
                const createVC = async (name, pList) => {
                    return await msg.guild.channels.create({
                        name: name, 
                        type: ChannelType.GuildVoice, 
                        parent: CONFIG.CATEGORY_VOICE_ID,
                        permissionOverwrites: [
                            { id: msg.guild.id, deny: [PermissionsBitField.Flags.Connect] },
                            ...pList.map(p => ({ id: p.id, allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] }))
                        ]
                    });
                };

                const vc1 = await createVC(`🔊 ${rN[0]} [#${mId}]`, t1);
                const vc2 = await createVC(`🔊 ${rN[1]} [#${mId}]`, t2);
                
                activeMatches.push({ id: mId, t1Name: rN[0], t2Name: rN[1], t1P: t1, t2P: t2, voices: [vc1.id, vc2.id] });

                const matchEmbed = new EmbedBuilder()
                    .setTitle(`⚔️ MATCH FOUND | TRẬN ĐẤU BẮT ĐẦU | #${mId}`)
                    .addFields(
                        { name: `🟦 ĐỘI ${rN[0]}`, value: t1.map(p => `• **${p.name}** (\`${p.elo}\`)`).join('\n'), inline: true },
                        { name: `🟥 ĐỘI ${rN[1]}`, value: t2.map(p => `• **${p.name}** (\`${p.elo}\`)`).join('\n'), inline: true }
                    )
                    .setImage(CONFIG.BANNER_URL)
                    .setColor(CONFIG.COLOR.GOLD)
                    .setFooter({ text: "Vui lòng kiểm tra tin nhắn riêng để lấy Link VIP." });

                msg.channel.send({ content: "@everyone", embeds: [matchEmbed] });

                const notifyPlayer = async (pList, vc) => {
                    for (const p of pList) {
                        const m = await msg.guild.members.fetch(p.id).catch(() => null);
                        if (m) {
                            const dmEmbed = new EmbedBuilder()
                                .setTitle("🛡️ TRẬN ĐẤU ĐÃ SẴN SÀNG")
                                .setDescription(`Trận đấu của bạn đã được thiết lập!\n\n🔗 **Link VIP:** [NHẤN VÀO ĐÂY](${CONFIG.VIP_LINK})\n🔊 **Kênh Voice:** ${vc.url}`)
                                .setColor(CONFIG.COLOR.SUCCESS)
                                .setFooter({ text: "PrimeBlox - Đỉnh cao xếp hạng" });
                            m.send({ embeds: [dmEmbed] }).catch(() => {});
                            if (m.voice.channel) await m.voice.setChannel(vc).catch(() => {});
                        }
                    }
                };
                await notifyPlayer(t1, vc1); 
                await notifyPlayer(t2, vc2);
            } catch (err) { console.error(err); }
        }
    }

    // --- LỆNH STATS ---
    if (command === 'stats') {
        const [r] = await pool.execute('SELECT * FROM users WHERE discordId = ?', [msg.author.id]);
        if (!r[0]) return msg.reply("❌ Bạn chưa xác minh!");
        const wr = (r[0].wins + r[0].losses) === 0 ? "0%" : ((r[0].wins / (r[0].wins + r[0].losses)) * 100).toFixed(1) + "%";
        
        const statsEmbed = new EmbedBuilder()
            .setAuthor({ name: `${r[0].robloxName}'s Statistics`, iconURL: msg.author.displayAvatarURL() })
            .setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${r[0].robloxId}&width=420&height=420&format=png`)
            .addFields(
                { name: "🏆 Rank Hiện Tại", value: `\`${r[0].elo} ELO\``, inline: true },
                { name: "📊 Win Rate", value: `\`${wr}\``, inline: true },
                { name: "🔥 Streak", value: `\`${r[0].streak >= 0 ? '+' + r[0].streak : r[0].streak}\``, inline: true },
                { name: "⚔️ Tổng Số Trận", value: `**${r[0].wins + r[0].losses}** (Thắng: ${r[0].wins} | Thua: ${r[0].losses})`, inline: false }
            )
            .setColor(r[0].streak >= 0 ? CONFIG.COLOR.SUCCESS : CONFIG.COLOR.ERROR)
            .setFooter({ text: "PrimeBlox Competitive System" });
        msg.reply({ embeds: [statsEmbed] });
    }

    // --- LỆNH WIN (SUPER ELITE VERSION) ---
    if (command === 'win') {
        if (!msg.member.roles.cache.has(CONFIG.ADMIN_ROLE_ID)) return;
        const mId = parseInt(args[0]);
        const winTeamName = args[1]?.toUpperCase();
        const matchIdx = activeMatches.findIndex(m => m.id === mId);
        
        if (matchIdx === -1) return msg.reply("❌ ID trận đấu này không tồn tại hoặc đã được xử lý.");

        const match = activeMatches[matchIdx];
        const winners = (winTeamName === match.t1Name) ? match.t1P : match.t2P;
        const losers = (winTeamName === match.t1Name) ? match.t2P : match.t1P;
        const loseTeamName = (winTeamName === match.t1Name) ? match.t2Name : match.t1Name;

        // Xử lý Winner
        for (const p of winners) {
            await pool.execute('UPDATE users SET elo = elo + ?, wins = wins + 1, streak = IF(streak < 0, 1, streak + 1) WHERE discordId = ?', [CONFIG.ELO.GAIN, p.id]);
            const member = await msg.guild.members.fetch(p.id).catch(() => null);
            if (member) {
                const winDM = new EmbedBuilder()
                    .setTitle("🏆 CHIẾN THẮNG (VICTORY)")
                    .setDescription(`Chúc mừng! Bạn đã giành chiến thắng trong trận đấu **#${mId}**.`)
                    .addFields({ name: "ELO Nhận Được", value: `\`+${CONFIG.ELO.GAIN}\` ELO`, inline: true })
                    .setColor(CONFIG.COLOR.SUCCESS).setTimestamp();
                member.send({ embeds: [winDM] }).catch(() => {});
            }
        }

        // Xử lý Loser
        for (const p of losers) {
            await pool.execute('UPDATE users SET elo = elo - ?, losses = losses + 1, streak = IF(streak > 0, -1, streak - 1) WHERE discordId = ?', [CONFIG.ELO.LOSS, p.id]);
            const member = await msg.guild.members.fetch(p.id).catch(() => null);
            if (member) {
                const loseDM = new EmbedBuilder()
                    .setTitle("💔 THẤT BẠI (DEFEAT)")
                    .setDescription(`Bạn đã để thua trong trận đấu **#${mId}**. Hãy cố gắng ở trận sau!`)
                    .addFields({ name: "ELO Bị Trừ", value: `\`-${CONFIG.ELO.LOSS}\` ELO`, inline: true })
                    .setColor(CONFIG.COLOR.ERROR).setTimestamp();
                member.send({ embeds: [loseDM] }).catch(() => {});
            }
        }

        // Gửi Embed Tổng Kết Cực Đẹp
        const resultEmbed = new EmbedBuilder()
            .setTitle(`🏁 TRẬN ĐẤU KẾT THÚC | MATCH OVER #${mId}`)
            .setDescription(`Admin **${msg.author.username}** đã xác nhận kết quả cho trận đấu này.`)
            .addFields(
                { 
                    name: `🏆 ĐỘI CHIẾN THẮNG: ${winTeamName}`, 
                    value: winners.map(p => `✅ **${p.name}** | \`+${CONFIG.ELO.GAIN}\``).join('\n'), 
                    inline: false 
                },
                { 
                    name: `💀 ĐỘI THẤT BẠI: ${loseTeamName}`, 
                    value: losers.map(p => `❌ **${p.name}** | \`-${CONFIG.ELO.LOSS}\``).join('\n'), 
                    inline: false 
                }
            )
            .setImage(CONFIG.BANNER_URL)
            .setColor(CONFIG.COLOR.GOLD)
            .setTimestamp()
            .setFooter({ text: "Hệ thống Xếp hạng PrimeBlox Elite" });

        await msg.channel.send({ embeds: [resultEmbed] });

        // Dọn dẹp
        for (const vId of match.voices) {
            const ch = await msg.guild.channels.fetch(vId).catch(() => null);
            if (ch) await ch.delete().catch(() => {});
        }
        activeMatches.splice(matchIdx, 1);
        updateAutoLB();
    }
});

// --- XỬ LÝ VERIFY ---
client.on('interactionCreate', async (i) => {
    if (i.isButton() && i.customId === 'v_start') {
        const modal = new ModalBuilder().setCustomId('m_v').setTitle('XÁC MINH TÀI KHOẢN');
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('r_u').setLabel("NHẬP TÊN ROBLOX CỦA BẠN").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("Ví dụ: RobloxPlayer123")));
        await i.showModal(modal);
    }
    if (i.type === InteractionType.ModalSubmit && i.customId === 'm_v') {
        const rName = i.fields.getTextInputValue('r_u');
        await i.deferReply({ ephemeral: true });
        try {
            const rId = await nblox.getIdFromUsername(rName);
            await pool.execute('INSERT INTO users (discordId, robloxName, robloxId, elo, wins, losses, streak) VALUES (?, ?, ?, 1000, 0, 0, 0) ON DUPLICATE KEY UPDATE robloxName = ?', [i.user.id, rName, rId.toString(), rName]);
            await i.editReply({ content: `✅ **Thành công!** Tài khoản **${rName}** đã được liên kết với Discord của bạn. Giờ bạn có thể dùng \`!j\` để leo rank.` });
        } catch (e) { await i.editReply({ content: "❌ **Lỗi!** Không tìm thấy tên người dùng Roblox này. Vui lòng kiểm tra lại chính tả." }); }
    }
});

client.login(process.env.DISCORD_TOKEN);
