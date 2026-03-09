const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, '../Besoin bénévoles.csv');
const sqlPath = path.join(__dirname, '../import.sql');

const csvData = fs.readFileSync(csvPath, 'utf8');

// Simple CSV parser that handles quotes
function parseCSV(text) {
    const result = [];
    let row = [];
    let cell = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (inQuotes) {
            if (char === '"') {
                if (i + 1 < text.length && text[i + 1] === '"') {
                    cell += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                cell += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
            } else if (char === ',') {
                row.push(cell);
                cell = '';
            } else if (char === '\n' || char === '\r') {
                if (char === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
                    i++;
                }
                if (cell || row.length > 0) {
                    row.push(cell);
                    result.push(row);
                }
                row = [];
                cell = '';
            } else {
                cell += char;
            }
        }
    }
    if (cell || row.length > 0) {
        row.push(cell);
        result.push(row);
    }
    return result;
}

const rows = parseCSV(csvData).slice(1); // skip header

// Parse French date: "15 mai 2026 08:00 (UTC+2) → 12:00"
function parseCreneau(creneau) {
    // Replace French month with number
    let s = creneau.replace('mai', '05');
    // "15 05 2026 08:00 (UTC+2) → 12:00" or similar
    // Actually, split by " → "
    const parts = s.split(' → ');
    if (parts.length !== 2) return null;
    const startPart = parts[0].trim(); // "15 05 2026 08:00 (UTC+2)"
    const endPart = parts[1].trim(); // "12:00" or maybe another full date? In our CSV it's just "12:00" or "13:30"
    
    // regex for start
    const startMatch = startPart.match(/(\d+)\s+(\d+)\s+(\d+)\s+(\d+:\d+)/);
    if (!startMatch) return null;
    
    const day = startMatch[1].padStart(2, '0');
    const month = startMatch[2].padStart(2, '0');
    const year = startMatch[3];
    const timeStart = startMatch[4];
    
    const timeEnd = endPart.match(/(\d+:\d+)/)[1];
    
    const isoStart = `${year}-${month}-${day}T${timeStart}:00+02:00`;
    const isoEnd = `${year}-${month}-${day}T${timeEnd}:00+02:00`;
    
    return { start: isoStart, end: isoEnd };
}

// 1. Collect unique periods and find their earliest start time for sorting
const periodesMap = new Map();
const postes = [];

rows.forEach(row => {
    if (row.length < 6) return;
    const [titre, bMax, bMin, creneau, description, periodeNom] = row;
    
    if (!titre || !periodeNom) return;
    
    const parsedDates = parseCreneau(creneau);
    if (!parsedDates) {
        console.error("Failed to parse datetimes for: ", creneau);
        return;
    }
    
    if (!periodesMap.has(periodeNom)) {
        periodesMap.set(periodeNom, {
            nom: periodeNom,
            earliestStart: parsedDates.start
        });
    } else {
        if (parsedDates.start < periodesMap.get(periodeNom).earliestStart) {
            periodesMap.get(periodeNom).earliestStart = parsedDates.start;
        }
    }
    
    postes.push({
        titre: titre,
        nb_max: parseInt(bMax) || 1,
        nb_min: parseInt(bMin) || 1,
        periode_debut: parsedDates.start,
        periode_fin: parsedDates.end,
        description: description,
        periodeNom: periodeNom
    });
});

let periodesArray = Array.from(periodesMap.values());
periodesArray.sort((a, b) => a.earliestStart.localeCompare(b.earliestStart));

let sql = `BEGIN;\n\n`;

// Clear tables just to be sure (already done but safe to include or omit)
// sql += `DELETE FROM public.postes;\n`;
// sql += `DELETE FROM public.periodes;\n\n`;

// Insert periods
periodesArray.forEach((p, index) => {
    // we use gen_random_uuid(), but we need associations.
    // Let's create an id using md5? No, easier to just generate an id in postgres:
    const safeNom = p.nom.replace(/'/g, "''");
    sql += `INSERT INTO public.periodes (nom, ordre, montant_credit) VALUES ('${safeNom}', ${index + 1}, 0.00);\n`;
});

sql += `\n`;

// Insert postes
postes.forEach(p => {
    const safeTitre = p.titre.replace(/'/g, "''");
    const safeDesc = p.description.replace(/'/g, "''");
    const safePeriodName = p.periodeNom.replace(/'/g, "''");
    
    sql += `INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT '${safeTitre}', ${p.nb_min}, ${p.nb_max}, '${p.periode_debut}'::timestamptz, '${p.periode_fin}'::timestamptz, '${safeDesc}', id
            FROM public.periodes WHERE nom = '${safePeriodName}';\n`;
});

sql += `\nCOMMIT;\n`;

fs.writeFileSync(sqlPath, sql);
console.log("SQL script generated at " + sqlPath);
