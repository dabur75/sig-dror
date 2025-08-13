const fs = require('fs');

// קבצים
const guides = require('./guides.json');
const constraints = require('./constraints.json');
const fixedConstraints = require('./fixed_constraints.json');
const vacations = require('./vacations.json');
const manualAssignments = require('./manual_assignments.json'); // חדש!

// שנה וחודש לשיבוץ
const year = 2025;
const month = 8; // אוגוסט

// טבלת שבתות פתוחות/סגורות (עריכה ידנית ע"פ לוח שנה!)
const weekendsType = {
    '2025-08-01': 'שבת פתוחה',
    '2025-08-08': 'שבת סגורה',
    '2025-08-15': 'שבת פתוחה',
    '2025-08-22': 'שבת סגורה',
    '2025-08-29': 'שבת פתוחה',
};

// שמות ימי השבוע
const hebrewWeekdays = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];

// כל התאריכים של החודש
function getAllDaysInMonth(year, month) {
    let days = [];
    for (
        let d = new Date(year, month-1, 1);
        d.getMonth() === month-1;
        d.setDate(d.getDate() + 1)
    ) {
        days.push(new Date(d));
    }
    return days;
}
const days = getAllDaysInMonth(year, month);

// פונקציה: האם למדריך יש אילוץ בתאריך זה?
function hasConstraint(guideId, date) {
    // חד פעמי
    if (constraints.some(c => c.guideId === guideId && c.date === date)) return true;
    // קבוע לפי יום בשבוע (0=ראשון...)
    if (fixedConstraints.some(fc => fc.guideId === guideId && fc.weekday === new Date(date).getDay())) return true;
    // חופשה מאושרת
    if (vacations.some(v => v.guideId === guideId && v.status === 'approved' &&
        v.dateStart <= date && v.dateEnd >= date)) return true;
    return false;
}

// ====== לדרופדאון בשיבוץ ידני ======
function getAvailableGuidesForDate(date) {
    return guides.filter(g =>
        g.role === 'מדריך' &&
        !hasConstraint(g.id, date)
    );
}

// === תמיכה בשיבוץ ידני manual_assignments.json ===
function getManualAssignment(date) {
    return manualAssignments.find(m => m.date === date);
}

// רוטציה פשוטה של מדריכים
let guideQueue = guides.filter(g => g.role === 'מדריך');
let guideCursor = 0;

// פונקציה למציאת מדריכים זמינים (כולל skipGuides)
function getNextAvailableGuides(date, howMany, skipGuides=[]) {
    let found = [];
    let checked = 0, i = guideCursor;
    while (found.length < howMany && checked < guideQueue.length * 2) {
        let g = guideQueue[i % guideQueue.length];
        if (
            !hasConstraint(g.id, date) &&
            !found.includes(g) &&
            !skipGuides.includes(g.name)
        ) {
            found.push(g);
        }
        i++;
        checked++;
    }
    guideCursor = (guideCursor + 1) % guideQueue.length;
    return found;
}

// הכנת תאריכי החודש עם סוג שבת
const result = days.map(d => {
    const iso = d.toISOString().slice(0,10);
    return {
        date: iso,
        weekday: 'יום ' + hebrewWeekdays[d.getDay()],
        weekendType: weekendsType[iso] || null
    };
});

// === שלב השיבוץ ===
let schedule = [];
let lastShabbatConan = null;

for (let i = 0; i < result.length; i++) {
    let day = result[i];
    let date = day.date;
    let weekdayNum = new Date(date).getDay();
    let guidesCount = 2;
    let roles = ['רגיל', 'רגיל'];

    // שבת סגורה = כונן
    if (day.weekendType === 'שבת סגורה') {
        guidesCount = 1;
        roles = ['כונן'];
    }

    // בדיקה אם יש שיבוץ ידני (manual_assignments.json)
    const manual = getManualAssignment(date);
    if (manual) {
        let guidesNames = manual.guides.map(id => {
            const g = guides.find(g=>g.id === id);
            return g ? g.name : '';
        });
        schedule.push({
            date,
            weekday: day.weekday,
            weekendType: day.weekendType,
            guides: guidesNames,
            roles: manual.roles,
            alert: false,
            manual: true
        });
        // אם שבת סגורה, לזכור את הכונן
        if (day.weekendType === 'שבת סגורה' && guidesNames[0]) {
            lastShabbatConan = {
                guideName: guidesNames[0],
                date: date
            };
        }
        continue; // דלג על שיבוץ אוטומטי
    }

    // מוצאי שבת סגורה – אל תשבץ את אותו כונן לראשון שאחריה
    let skipGuides = [];
    if (
        weekdayNum === 0 &&
        lastShabbatConan &&
        new Date(date) - new Date(lastShabbatConan.date) === 24*60*60*1000
    ) {
        skipGuides = [lastShabbatConan.guideName];
        lastShabbatConan = null; // מאפסים
    }

    let available = getNextAvailableGuides(date, guidesCount, skipGuides);

    // אם אין מספיק — משאיר ריקים + מתריע
    let alert = false;
    if (available.length < guidesCount) {
        alert = true;
        while (available.length < guidesCount) {
            available.push({ name: "" });
        }
    }

    schedule.push({
        date,
        weekday: day.weekday,
        weekendType: day.weekendType,
        guides: available.map(g=>g.name),
        roles: roles.slice(0, guidesCount),
        alert
    });

    // סימון מי היה כונן בשבת סגורה
    if (day.weekendType === 'שבת סגורה' && available[0] && available[0].name) {
        lastShabbatConan = {
            guideName: available[0].name,
            date: date
        };
    }
}

// הצגה ב-console
console.log(schedule);

// שמירה לקובץ
fs.writeFileSync('schedule.json', JSON.stringify(schedule, null, 2), 'utf-8');
console.log('Saved to schedule.json');

// ייצוא הפונקציה ל-app.js או לכל מודול אחר
module.exports = { getAvailableGuidesForDate, hasConstraint };
