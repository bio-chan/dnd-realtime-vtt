# D&D Real-time Virtual Tabletop (VTT) & 3D Dice Roller

เว็บแอปพลิเคชันระบบกระดานเสมือนจำลองสำหรับเล่น D&D แบบ Real-time ผ่าน Web Browser รองรับธีม Dark Fantasy สไตล์ Baldur's Gate 3 / D&D Beyond เต็มรูปแบบ พร้อมระบบล็อกอินสร้างตัวละคร ทอยเต๋า 3 มิติ และระบบจัดการการต่อสู้สำหรับ Dungeon Master

---

## ฟีเจอร์เด่น (Key Features)

1. **ธีม Dark Fantasy RPG:**
   - ดีไซน์สวยงามระดับพรีเมียม โทนสีทองโบราณ (Gold), แดงทับทิม (Ruby), และน้ำเงินคริสตัล (Mana)
   - ฟอนต์ Cinzel, Sarabun, Fira Code สะอาดตา ไม่มี Emoji กวนสายตา

2. **ระบบบัญชีและ Character Sheet ครบวงจร:**
   - สมัครสมาชิก (Register) และเข้าสู่ระบบ (Login) ด้วย Username & Password
   - ระบบ Character Sheet ที่สร้างตามแบบฉบับ D&D:
     - อัปโหลดรูปภาพตัวละคร (Portrait) ปรับขนาดและเก็บภาพอัตโนมัติ
     - ข้อมูลตัวละคร: ชื่อ, เผ่า (Race), อาชีพ (Class), ส่วนสูง
     - ค่าพลังหลัก 6 ด้าน (STR, DEX, CON, INT, WIS, CHA) พร้อมคำนวณโบนัส Modifier (+/-) อัตโนมัติ
     - Vitals: ค่า HP (Hit Points) และ SP (Spell Points)
     - สกิลความสามารถ (Skills) และท่าไม้ตาย (Ultimate)
     - ภูมิหลังเรื่องราว (Story & Background), ข้อดี และข้อเสีย
     - อุปกรณ์สวมใส่: อาวุธ (Weapon), ชุดเกราะ (Armor)
     - กระเป๋าไอเทม (Inventory) พร้อมระบบระบุจำนวนสิ่งของ

3. **ระบบสิทธิ์ DM และการตรวจสอบตัวละคร:**
   - Dungeon Master (DM) สามารถเปิดดูและแก้ไข Character Sheet ของผู้เล่นทุกคนในห้องได้แบบ Real-time
   - ผู้เล่น (Player) สามารถเปิดดูและแก้ไข Character Sheet ของตัวเองได้

4. **ระบบทอยลูกเต๋า 3 มิติ (3D Animated Dice Roller & Audio):**
   - ลูกเต๋ามาตรฐานครบชุด: `d4`, `d6`, `d8`, `d10`, `d12`, `d20`, `d100`
   - แอนิเมชันลูกเต๋า 3D หมุนสมจริงกลางหน้าจอ พร้อมเสียงทอยเต๋าแบบสังเคราะห์ (Web Audio API)
   - ระบบตรวจจับ Natural 20 (Critical Success แสงสีทองพร้อมเสียง Fanfare) และ Natural 1 (Critical Fail แสงสีแดงพร้อมเสียง Thud)
   - ทุกคนที่อยู่ในห้องจะเห็นผลการทอยและแอนิเมชันลูกเต๋าไปพร้อมๆ กัน

5. **ระบบทอยลูกเต๋าตามเทิร์น (Turn-based Dice Restriction) & ระบบ Event:**
   - เมื่อ DM สั่งเริ่มการต่อสู้ (Combat) ผู้เล่นจะสามารถทอยลูกเต๋าได้เฉพาะเมื่อถึงรอบ (Turn) ของตัวเองเท่านั้น
   - DM สามารถสร้าง **Event** (เช่น "ต่อรองกับพ่อค้า", "กระโดดข้ามหน้าผา") เพื่อปลดล็อกให้ทุกคนทอยลูกเต๋าพร้อมกันได้ทันทีแม้อยู่ในการต่อสู้
   - DM มีสิทธิ์ทอยลูกเต๋าได้ตลอดเวลาโดยไม่มีข้อจำกัด

6. **ระบบสมรภูมิและการต่อสู้ (Battlefield & Initiative Tracker):**
   - DM สามารถอัญเชิญ Monster / NPC เข้าสู่สมรภูมิได้
   - ระบบ **ซ่อน/เปิดเผย HP มอนสเตอร์ (Monster HP Concealment):** DM สามารถคลิก Reveal HP หรือ Hide HP เพื่อให้ผู้เล่นเห็นหรือซ่อนหลอดเลือดของมอนสเตอร์แต่ละตัวได้
   - ระบบจัดการ Initiative, สลับเทิร์น (Next Turn), ปรับค่า HP/SP และจัดการสถานะ (Status Buff/Debuff)

7. **ระบบ Save & Load Session:**
   - DM สามารถ Export สถานะเกมทั้งหมดเป็นไฟล์ `.json` เพื่อบันทึกความคืบหน้า และนำกลับมาโหลดต่อรอบถัดไปได้ทันที

---

## โครงสร้างโปรเจกต์ (Project Structure)

```plaintext
DnD/
├── package.json       # Express 4, Socket.io 4
├── server.js          # Backend Server (Auth, Character CRUD, Room & Turn Logic, Socket.io Sync)
├── public/
│   ├── index.html     # โครงสร้างหน้าจอ (Auth, Sheet Editor, Lobby, Game Tabletop, Modals)
│   ├── style.css      # Dark Fantasy RPG CSS, 3D Keyframe Animations, Glassmorphism
│   └── client.js      # ระบบเชื่อมต่อ Socket, ทอยเต๋า 3D, Web Audio Synthesizer, Modal Editor
├── README.md          # เอกสารคู่มือโปรเจกต์
└── .gitignore         # ละเว้น node_modules
```

---

## วิธีติดตั้งและเริ่มใช้งาน (Installation & Quick Start)

### วิธีที่ 1: รันในเครื่อง (Localhost)

1. ติดตั้ง Dependencies:
   ```bash
   npm install
   ```
2. รันเซิร์ฟเวอร์:
   ```bash
   npm start
   ```
3. เปิด Web Browser ไปที่:
   ```text
   http://localhost:3000
   ```

### วิธีที่ 2: เล่นกับเพื่อนในวง LAN หรือ Wi-Fi เดียวกัน
- หา IP เครื่องโฮสต์ (เช่น `192.168.1.xxx`)
- ให้เพื่อนเปิดเบราว์เซอร์ไปที่:
  ```text
  http://192.168.1.xxx:3000
  ```

### วิธีที่ 3: นำขึ้น Online Cloud (Render.com / Railway.app)
1. Fork หรือ Push โค้ดขึ้น GitHub Repository
2. สร้าง Web Service ใหม่ใน Render หรือ Railway โดยเชื่อมกับ Repository
3. ระบุ:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. นำโดเมน URL ที่ได้ส่งให้เพื่อนในปาร์ตี้เข้าร่วมเล่นได้จากทั่วโลก
