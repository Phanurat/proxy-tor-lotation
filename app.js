const express = require('express');
const net = require('net');
const axios = require('axios');
const { SocksProxyAgent } = require('socks-proxy-agent');

const app = express();
const agent = new SocksProxyAgent('socks5h://127.0.0.1:9050');

// ฟังก์ชันหมุน IP ที่มีระบบ Timeout และตรวจสอบความพร้อม
const rotateIP = () => {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            client.destroy();
            reject(new Error('Tor rotation timeout (15s)'));
        }, 15000);

        const client = net.createConnection({ port: 9051, host: '127.0.0.1' }, () => {
            client.write('AUTHENTICATE ""\n');
            client.write('signal NEWNYM\n');
            client.write('QUIT\n');
        });

        client.on('data', (data) => {
            if (data.toString().includes('250')) {
                console.log('🔄 Tor: Signal sent. Verifying new path...');
                clearTimeout(timeout);
                // รอ 3 วินาทีเบื้องต้นก่อนส่ง resolve
                setTimeout(resolve, 3000);
            }
        });

        client.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
};

// API สำหรับดึง Proxy พร้อมเช็ค IP จริงให้เห็นเลย
app.get('/get-proxy', async (req, res) => {
    try {
        await rotateIP();

        // ส่วนสำคัญ: ลองเช็ค IP จริงๆ จนกว่าจะสำเร็จ (Retry 3 ครั้ง)
        let publicIP = null;
        for (let i = 0; i < 3; i++) {
            try {
                const check = await axios.get('https://api.ipify.org?format=json', {
                    httpAgent: agent,
                    httpsAgent: agent,
                    timeout: 5000
                });
                publicIP = check.data.ip;
                break; // สำเร็จแล้ว ออกจาก Loop
            } catch (e) {
                console.log(`⚠️ Waiting for Tor circuit... (${i+1})`);
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        if (!publicIP) throw new Error("Could not verify Tor IP");

        console.log(`✅ Ready! IP: ${publicIP}`);

        res.json({
            status: "OK",
            data: {
                proxy: "127.0.0.1:9050",
                type: "socks5",
                ipv4: publicIP
            }
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
        res.json({ status: "ERROR", message: error.message });
    }
});

app.listen(8000, () => console.log('🚀 High-Performance Proxy API running on port 8000'));
