import {LANGUAGE_ENERGY_JOULES} from "../assets/energy-table";

export function calculateWeightedEnergy(languageUsage: Record<string, number>) {
    const totalBytes = Object.values(languageUsage).reduce((a, b) => a + b, 0);
    let weightedJoules = 0;

    for (const [lang, bytes] of Object.entries(languageUsage)) {
        const weight = bytes / totalBytes;
        const energy = LANGUAGE_ENERGY_JOULES[lang];
        if (energy !== undefined) {
            weightedJoules += weight * energy;
        }
    }

    return parseFloat(weightedJoules.toFixed(2));
}
