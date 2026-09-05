// Scheduled break slots and kitchen capacity throttling helper

const MAX_SLOT_CAPACITY = 25; // Maximum orders allowed in a single 15-minute window
const PREP_WINDOW_MINUTES = 12; // Cooking starts 12 minutes prior to slot start time

const BREAK_SLOT_LABELS = {
  "10:30-10:45": "Morning Recess ☕",
  "11:00-11:15": "Mid-Morning Break 🥪",
  "12:45-13:00": "Lunch Break — Slot 1 🍛",
  "13:00-13:15": "Lunch Break — Slot 2 🍛",
  "13:15-13:30": "Lunch Break — Slot 3 🍛",
  "14:00-14:15": "Post-Lunch Slot 🍵",
  "16:00-16:15": "Evening Tea & Snacks 🥪",
  "17:00-17:15": "Campus Evening Break 🥤",
};

/**
 * Returns formatted today date string in YYYY-MM-DD
 */
function getTodayDateString(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Converts 24-hr time string "13:15" to 12-hr readable string "1:15 PM"
 */
function format12Hour(timeStr) {
  const [hStr, mStr] = timeStr.split(":");
  let h = parseInt(hStr, 10);
  const m = mStr;
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

/**
 * Formats "13:15-13:30" to "1:15 PM – 1:30 PM"
 */
function formatSlotLabel(slotKey) {
  const [start, end] = slotKey.split("-");
  const base = `${format12Hour(start)} – ${format12Hour(end)}`;
  const tag = BREAK_SLOT_LABELS[slotKey];
  return tag ? `${base} (${tag})` : base;
}

/**
 * Generates all 15-minute slots between 09:00 and 18:00
 */
function generateAllDaySlots() {
  const slots = [];
  const startHour = 9;
  const endHour = 18;

  for (let h = startHour; h < endHour; h++) {
    for (const m of [0, 15, 30, 45]) {
      const startMinutes = h * 60 + m;
      const endMinutes = startMinutes + 15;

      const sh = String(Math.floor(startMinutes / 60)).padStart(2, "0");
      const sm = String(startMinutes % 60).padStart(2, "0");
      const eh = String(Math.floor(endMinutes / 60)).padStart(2, "0");
      const em = String(endMinutes % 60).padStart(2, "0");

      const key = `${sh}:${sm}-${eh}:${em}`;
      slots.push({
        slot: key,
        startMinutes,
        endMinutes,
        startTime: `${sh}:${sm}`,
        endTime: `${eh}:${em}`,
      });
    }
  }
  return slots;
}

/**
 * Returns available break slots for today with remaining capacities
 */
async function getAvailableSlots(prisma, targetDate = new Date()) {
  const dateStr = getTodayDateString(targetDate);
  const allSlots = generateAllDaySlots();

  // Current time in minutes from midnight
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // Fetch count of orders already scheduled per slot for this date
  const counts = await prisma.order.groupBy({
    by: ["scheduledSlot"],
    where: {
      scheduledDate: dateStr,
      scheduledSlot: { not: null },
      status: { notIn: ["CANCELLED"] },
    },
    _count: { id: true },
  });

  const bookedMap = {};
  for (const c of counts) {
    if (c.scheduledSlot) {
      bookedMap[c.scheduledSlot] = c._count.id;
    }
  }

  // Filter slots: must start at least 12 minutes in the future to allow scheduling
  const available = allSlots
    .filter((s) => s.startMinutes > currentMinutes + 12)
    .map((s) => {
      const booked = bookedMap[s.slot] || 0;
      const remaining = Math.max(0, MAX_SLOT_CAPACITY - booked);
      const isFull = remaining <= 0;
      const isBreakSlot = Boolean(BREAK_SLOT_LABELS[s.slot]);

      return {
        slot: s.slot,
        label: formatSlotLabel(s.slot),
        breakName: BREAK_SLOT_LABELS[s.slot] || null,
        isBreakSlot,
        startTime: s.startTime,
        endTime: s.endTime,
        booked,
        remaining,
        maxCapacity: MAX_SLOT_CAPACITY,
        isFull,
      };
    });

  return {
    date: dateStr,
    slots: available,
  };
}

/**
 * Checks if a scheduled order has entered its preparation window
 * @param {string} slotKey e.g. "13:15-13:30"
 * @param {string} dateStr e.g. "2026-09-04"
 */
function isOrderInCookingWindow(slotKey, dateStr) {
  if (!slotKey) return true; // immediate orders are always in window

  const todayStr = getTodayDateString();
  if (dateStr && dateStr !== todayStr) {
    return false; // scheduled for another day
  }

  const [startTime] = slotKey.split("-");
  const [h, m] = startTime.split(":").map(Number);
  const slotStartMinutes = h * 60 + m;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // Cooking window starts PREP_WINDOW_MINUTES before slot
  return currentMinutes >= slotStartMinutes - PREP_WINDOW_MINUTES;
}

module.exports = {
  MAX_SLOT_CAPACITY,
  PREP_WINDOW_MINUTES,
  BREAK_SLOT_LABELS,
  getTodayDateString,
  formatSlotLabel,
  getAvailableSlots,
  isOrderInCookingWindow,
};
