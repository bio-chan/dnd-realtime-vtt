# D&D Real-time Virtual Tabletop (VTT) & 3D Dice Roller
### Classic Retro Pixel RPG Edition

เว็บแอปพลิเคชันระบบกระดานเสมือนจำลองสำหรับเล่น D&D แบบ Real-time ผ่าน Web Browser ในดีไซน์ **Classic Retro Pixel RPG** (มุมเหลี่ยมคม ไร้ส่วนโค้งมน ขอบเส้น Stroke หนา และ Drop Shadow สี่เหลี่ยมสีดำสไตล์เกม RPG 16-bit พร้อมฟอนต์พิกเซล)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/bio-chan/dnd-realtime-vtt)

---

## ฟีเจอร์เด่น (Features & D&D Mechanics)

1. **ดีไซน์ Classic Retro Pixel RPG:**
   - **No Rounded Corners:** มุมเหลี่ยมคมกริบแบบฉบับเกมคลาสสิก (Dragon Quest / Final Fantasy / Chrono Trigger)
   - **Hard Black Drop Shadows & Pixel Stroke:** กรอบหน้าต่างแบบ Dialog Box 2 ชั้น พร้อมเงาสี่เหลี่ยมสีดำทึบ 100%
   - **Pixel Fonts:** ใช้ฟอนต์พิกเซล Google Fonts (`Press Start 2P`, `Silkscreen`, `VT323`, `Chakra Petch`) รองรับทั้งภาษาอังกฤษและภาษาไทยอย่างลงตัว

2. **ระบบแสดงข้อมูลตัวละครผู้เล่นบนหน้าเล่นจริง (Player Character HUD & Party Dossier):**
   - **สำหรับผู้เล่น (Player):** ในหน้าจอเล่นเกม แถบขวาจะแสดงหน้าต่าง **"My Character"** ให้เห็นแบบเต็มตาตลอดเวลา:
     - รูปพิกเซลตัวละคร (Portrait)
     - ชื่อ, เผ่า (Race), อาชีพ (Class), ค่า AC และ Speed
     - หลอด HP และ SP พร้อมตัวเลขเลือดปัจจุบัน
     - ตารางค่าพลัง 6 ด้าน (STR, DEX, CON, INT, WIS, CHA) พร้อมโบนัส Modifier (+/-) ในสไตล์ Retro Arcade Stat Grid (คลิกเพื่อทอย Check ได้ทันที)
     - รายการอาวุธ (Weapon) และชุดเกราะ (Armor) ที่สวมใส่
     - กระเป๋าไอเทม (Inventory) พร้อมจำนวนสิ่งของ
     - สกิล, อัลติ, ภูมิหลัง และข้อดี/ข้อเสีย
   - **สำหรับ DM:** แถบขวาสามารถสลับแท็บระหว่าง **DM Command** (อัญเชิญมอนสเตอร์/สร้าง Event) และ **Party Roster** (เลือกดูข้อมูลตัวละครและของในกระเป๋าของผู้เล่นแต่ละคนได้ทันที)
   - **บนการ์ดในสมรภูมิ:** มีปุ่ม Inspect ให้กดเปิดดูข้อมูลผู้เล่นแต่ละคนได้สะดวกรวดเร็ว

3. **ระบบบัญชีตั้งต้น (Default Accounts):**
   - **Dungeon Master (DM):** Username: `dm` / Password: `1234`
   - **Player (น้องเป็ดไวกิ้ง):** Username: `player1` / Password: `1234`
   - หรือกดแท็บ **"สร้างบัญชีใหม่ (Register)"** เพื่อสร้างตัวละครใหม่ได้ไม่จำกัด

4. **Dungeon Master Screen (ฉากกั้นของ DM - GM เห็นข้อมูลทั้งหมด):**
   - ปุ่ม **"DM Screen"** บนแถบเมนู เพื่อเปิดตารางสรุปข้อมูลทุกคนในปาร์ตี้:
     - ค่า HP/Max HP (แถบสีเตือนเลือด), SP/Max SP
     - **AC (Armor Class)** และ **Passive Perception**
     - ค่าพลัง 6 ด้าน พร้อม Modifier
     - อาวุธ, เกราะ, ไอเทม และ HP จริงของมอนสเตอร์ทุกตัว (แม้ว่าจะซ่อนจากผู้เล่น)
     - ปุ่มกดดู/แก้ไขข้อมูลของตัวละครนั้นๆ ได้ทันที

5. **ระบบกลไก D&D 5e แท้ (True D&D 5e Rules):**
   - **Advantage & Disadvantage Roller:** เลือกทอยแบบปกติ (Normal), ได้เปรียบ (Advantage - ทอย 2 ลูกเลือกค่าสูงสุด), หรือเสียเปรียบ (Disadvantage - ทอย 2 ลูกเลือกค่าต่ำสุด)
   - **D&D Quick Checks:** ปุ่มลัดทอย Attack, Ability Checks (STR, DEX, CON, INT, WIS, CHA) และ Death Save
   - **Death Saving Throws:** เมื่อ HP ลดเหลือ 0 จะปรากฏระบบทอยเซฟความตาย (Success 3 ครั้ง / Fail 3 ครั้ง)
   - **D&D 5e Status Conditions:** เมนูดรอปดาวน์เลือกสถานะทางการทั้ง 14 แบบ เช่น *Blinded, Charmed, Frightened, Grappled, Invisible, Paralyzed, Poisoned, Prone, Stunned, Unconscious, Exhaustion*
   - **Short Rest & Long Rest:** DM สามารถสั่งพักสั้น (+30% HP/SP) หรือพักยาว (ฟื้นฟู 100% เต็ม) ได้ด้วยคลิกเดียว

6. **ระบบทอยลูกเต๋า 3 มิติ (3D Dice Roller) & ระบบ Event:**
   - ทอยลูกเต๋า 3D สไตล์ Retro Cube พร้อมเสียงสังเคราะห์ (Web Audio API)
   - เอฟเฟกต์ Natural 20 (Critical Success แสงสีทอง) และ Natural 1 (Critical Fail แสงสีแดง)
   - ในช่วงต่อสู้ ล็อคไม่ให้ทอยถ้ายังไม่ถึงเทิร์น แต่ DM สามารถสร้าง **Event** (เช่น ต่อรอง, หลบกับดัก) เพื่อให้ทุกคนทอยพร้อมกันได้

---

## วิธีติดตั้งและรันใช้งาน (Installation & Deployment)

### 1. ลิงก์ออนไลน์เล่นได้ทันที (Live Public Tunnel)
- ลิงก์เข้าเล่น: **https://better-wolves-run.loca.lt**
*(หากมีหน้าแจ้งเตือน Password ให้กรอก IP โฮสต์: `184.82.86.73`)*

### 2. นำขึ้น Cloud Hosting ฟรี 24 ชั่วโมง (Render.com / Railway.app)
- โปรเจกต์มีไฟล์ `render.yaml` และ `Dockerfile` รองรับ 1-Click Deploy สมบูรณ์แบบ
- **Render.com:**
  1. เข้า [https://render.com/deploy?repo=https://github.com/bio-chan/dnd-realtime-vtt](https://render.com/deploy?repo=https://github.com/bio-chan/dnd-realtime-vtt)
  2. กด **Apply / Deploy** เพื่อรันเซิร์ฟเวอร์ออนไลน์ฟรี 24 ชั่วโมง พร้อม URL ถาวร
- **Railway.app:**
  1. เข้า [https://railway.app](https://railway.app)
  2. เลือก **New Project** -> **Deploy from GitHub repo** -> เลือก `bio-chan/dnd-realtime-vtt`

### 3. รันในเครื่อง (Localhost)
```bash
npm install
npm start
```
เปิดเบราว์เซอร์ไปที่: `http://localhost:3000`
