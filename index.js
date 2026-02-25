/**
 * ==========================================
 * PRIMEBLOX MULTIPLAYER SYSTEM V12.3 - ELITE
 * FULL: AUTO-LB, VOICE LOCK, AUTO-MOVE, STREAK
 * TOTAL LINES: ~225+
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

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User]
});

// --- CẤU HÌNH ---
const CONFIG = {
    ADMIN_ROLE_ID: "1465374336214106237",
    VERIFY_CHANNEL_ID: "1476164329962213477",
    LB_CHANNEL_ID: "1474674662792232981", 
    CATEGORY_VOICE_ID: "1476182203653161061", 
    LOG_CHANNEL_ID: "1476182400617680968",
    VIP_LINK: "https://www.roblox.com/vi/games/301549746/Counter-Blox?privateServerLinkCode=56786714113746670670511968107962",
    BANNER_URL: "https://www.dexerto.com/cdn-image/wp-content/uploads/2026/01/22/Counter-Blox-codes.jpg?width=1200&quality=60&format=auto",
    COLOR: { SUCCESS: 0x2ecc71, ERROR: 0xe74c3c, INFO: 0x3498db, GOLD: 0xf1c40f, DARK: 0x1a1a1a },
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

// --- HÀM CẬP NHẬT BXH TỰ ĐỘNG (GIAO DIỆN MỚI) ---
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
            .setDescription(lbText || "Chưa có dữ liệu")
            .setColor(CONFIG.COLOR.GOLD)
            .setThumbnail(CONFIG.BANNER_URL)
            .setFooter({ text: `Cập nhật tự động mỗi 5 phút • ${new Date().toLocaleString('vi-VN')}` });

        const messages = await channel.messages.fetch({ limit: 5 });
        const lastBotMsg = messages.find(m => m.author.id === client.user.id);
        
        if (lastBotMsg) await lastBotMsg.edit({ embeds: [embed] });
        else await channel.send({ embeds: [embed] });
    } catch (e) { console.error("LB Update Error:", e); }
}

// --- HÀM ĐẨY VERIFY LÊN ĐẦU ---
async function sendVerifyEmbed(channel) {
    const embed = new EmbedBuilder()
        .setTitle("🛡️ PrimeBlox — Account Verification")
        .setDescription("Vui lòng xác minh tài khoản Roblox để tham gia hệ thống xếp hạng.")
        .setColor(CONFIG.COLOR.INFO)
        .setImage(CONFIG.BANNER_URL);
    
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('v_start').setLabel('Xác minh ngay').setStyle(ButtonStyle.Primary).setEmoji('✅')
    );

    const msgs = await channel.messages.fetch({ limit: 10 });
    const oldVerify = msgs.filter(m => m.author.id === client.user.id && m.embeds[0]?.title?.includes("Account Verification"));
    
    if (oldVerify.size > 0) {
        if (msgs.first().id !== oldVerify.first().id) {
            await channel.bulkDelete(oldVerify).catch(() => {});
            await channel.send({ embeds: [embed], components: [row] });
        }
    } else {
        await channel.send({ embeds: [embed], components: [row] });
    }
}

client.on('ready', async () => {
    console.log(`[SYSTEM] PrimeBlox V12.3 Online: ${client.user.tag}`);
    client.user.setActivity('Competitive Matches', { type: ActivityType.Competing });
    updateAutoLB();
    setInterval(updateAutoLB, 300000); 
});

client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.guild) return;

    if (msg.channel.id === CONFIG.VERIFY_CHANNEL_ID) {
        await sendVerifyEmbed(msg.channel);
    }

    if (!msg.content.startsWith('!')) return;
    const args = msg.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // --- LỆNH JOIN ( !j ) ---
    if (command === 'j') {
        const mode = args[0];
        if (!queues[mode]) return msg.reply("⚠️ Sử dụng: `!j 1v1`, `!j 2v2` hoặc `!j 5v5`.");
        
        const [rows] = await pool.execute('SELECT * FROM users WHERE discordId = ?', [msg.author.id]);
        if (!rows[0]) return msg.reply(`❌ Bạn chưa xác minh! <#${CONFIG.VERIFY_CHANNEL_ID}>.`);
        
        if (Object.values(queues).some(q => q.players.some(p => p.id === msg.author.id))) {
            return msg.reply("🚫 Bạn đã trong hàng chờ!");
        }

        queues[mode].players.push({ id: msg.author.id, name: rows[0].robloxName, elo: rows[0].elo });
        msg.channel.send({ 
            embeds: [new EmbedBuilder().setDescription(`📥 **${rows[0].robloxName}** đã vào hàng chờ **${mode}**`).setColor(CONFIG.COLOR.INFO)] 
        });

        if (queues[mode].players.length === queues[mode].limit) {
            const players = [...queues[mode].players].sort(() => 0.5 - Math.random());
            queues[mode].players = [];
            
            const mId = Math.floor(100000 + Math.random() * 900000);
            const rN = [...teamNames].sort(() => 0.5 - Math.random());
            const t1 = players.slice(0, players.length / 2);
            const t2 = players.slice(players.length / 2);

            try {
                const createMatchVC = async (name, pList) => {
                    return await msg.guild.channels.create({
                        name: name, 
                        type: ChannelType.GuildVoice, 
                        parent: CONFIG.CATEGORY_VOICE_ID,
                        permissionOverwrites: [
                            { id: msg.guild.id, deny: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] },
                            ...pList.map(p => ({ id: p.id, allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] }))
                        ]
                    });
                };

                const vc1 = await createMatchVC(`🔊 ${rN[0]} (#${mId})`, t1);
                const vc2 = await createMatchVC(`🔊 ${rN[1]} (#${mId})`, t2);
                
                activeMatches.push({ id: mId, t1Name: rN[0], t2Name: rN[1], t1P: t1, t2P: t2, voices: [vc1.id, vc2.id] });

                msg.channel.send({ 
                    content: "@everyone", 
                    embeds: [
                        new EmbedBuilder()
                        .setTitle(`⚔️ MATCH FOUND | #${mId}`)
                        .setImage(CONFIG.BANNER_URL)
                        .addFields(
                            { name: `🟦 Team ${rN[0]}`, value: t1.map(p => `• ${p.name}`).join('\n'), inline: true },
                            { name: `🟥 Team ${rN[1]}`, value: t2.map(p => `• ${p.name}`).join('\n'), inline: true }
                        )
                        .setColor(CONFIG.COLOR.GOLD)
                    ] 
                });

                const processMove = async (pList, vc) => {
                    for (const p of pList) {
                        const m = await msg.guild.members.fetch(p.id).catch(() => null);
                        if (m) {
                            m.send({ 
                                embeds: [new EmbedBuilder().setTitle("🛡️ TRẬN ĐẤU SẴN SÀNG!").setDescription(`Phòng: ${vc.url}\nLink VIP: [Tại đây](${CONFIG.VIP_LINK})`).setColor(CONFIG.COLOR.SUCCESS)] 
                            }).catch(() => {});
                            if (m.voice.channel) await m.voice.setChannel(vc).catch(() => {});
                        }
                    }
                };
                await processMove(t1, vc1); 
                await processMove(t2, vc2);
            } catch (err) { console.error(err); }
        }
    }

    // --- LỆNH STATS (MẪU MỚI + STREAK) ---
    if (command === 'stats') {
        const [r] = await pool.execute('SELECT * FROM users WHERE discordId = ?', [msg.author.id]);
        if (!r[0]) return msg.reply("❌ Bạn chưa xác minh!");
        
        const wr = (r[0].wins + r[0].losses) === 0 ? "0%" : ((r[0].wins / (r[0].wins + r[0].losses)) * 100).toFixed(1) + "%";
        const streak = r[0].streak || 0;

        const statsEmbed = new EmbedBuilder()
            .setAuthor({ name: `${r[0].robloxName}'s Stats`, iconURL: msg.author.displayAvatarURL() })
            .addFields(
                { name: "🏆 Rank", value: `Member (${r[0].elo} ELO)`, inline: true },
                { name: "📊 Win Rate", value: `\`${wr}\``, inline: true },
                { name: "🎮 Matches", value: `\`${r[0].wins + r[0].losses}\``, inline: true },
                { name: "🔥 Current Streak", value: `\`${streak >= 0 ? '+' + streak : streak} Streak\``, inline: false },
                { name: "⚔️ Recent", value: "History clean." }
            )
            .setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${r[0].robloxId}&width=420&height=420&format=png`)
            .setColor(streak >= 0 ? CONFIG.COLOR.SUCCESS : CONFIG.COLOR.ERROR)
            .setFooter({ text: `W: ${r[0].wins} | L: ${r[0].losses}` });
        
        msg.reply({ embeds: [statsEmbed] });
    }

    // --- LỆNH WIN (ADMIN + STREAK LOGIC) ---
    if (command === 'win') {
        if (!msg.member.roles.cache.has(CONFIG.ADMIN_ROLE_ID)) return;
        const mId = parseInt(args[0]);
        const winTeam = args[1]?.toUpperCase();
        const matchIdx = activeMatches.findIndex(m => m.id === mId);
        if (matchIdx === -1) return msg.reply("❌ ID không tồn tại.");

        const match = activeMatches[matchIdx];
        const winners = (winTeam === match.t1Name) ? match.t1P : match.t2P;
        const losers = (winTeam === match.t1Name) ? match.t2P : match.t1P;

        for (const p of winners) {
            await pool.execute('UPDATE users SET elo = elo + ?, wins = wins + 1, streak = IF(streak < 0, 1, streak + 1) WHERE discordId = ?', [CONFIG.ELO.GAIN, p.id]);
        }
        for (const p of losers) {
            await pool.execute('UPDATE users SET elo = elo - ?, losses = losses + 1, streak = IF(streak > 0, -1, streak - 1) WHERE discordId = ?', [CONFIG.ELO.LOSS, p.id]);
        }

        msg.channel.send(`✅ Trận #${mId} kết thúc. Thắng: **${winTeam}**. BXH đã cập nhật.`);
        for (const vId of match.voices) {
            const ch = await msg.guild.channels.fetch(vId).catch(() => null);
            if (ch) await ch.delete().catch(() => {});
        }
        activeMatches.splice(matchIdx, 1);
        updateAutoLB();
    }
});

// --- VERIFY LOGIC ---
client.on('interactionCreate', async (i) => {
    if (i.isButton() && i.customId === 'v_start') {
        const modal = new ModalBuilder().setCustomId('m_v').setTitle('Verify');
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('r_u').setLabel("Roblox User").setStyle(TextInputStyle.Short).setRequired(true)));
        await i.showModal(modal);
    }
    if (i.type === InteractionType.ModalSubmit && i.customId === 'm_v') {
        const rName = i.fields.getTextInputValue('r_u');
        await i.deferReply({ ephemeral: true });
        try {
            const rId = await nblox.getIdFromUsername(rName);
            await pool.execute('INSERT INTO users (discordId, robloxName, robloxId, elo, wins, losses, streak) VALUES (?, ?, ?, 1000, 0, 0, 0) ON DUPLICATE KEY UPDATE robloxName = ?', [i.user.id, rName, rId.toString(), rName]);
            await i.editReply("✅ Thành công!");
        } catch (e) { await i.editReply("❌ Lỗi!"); }
    }
});

client.login(process.env.DISCORD_TOKEN);
