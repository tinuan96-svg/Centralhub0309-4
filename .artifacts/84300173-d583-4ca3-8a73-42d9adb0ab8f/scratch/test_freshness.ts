function checkFreshness(lastScannedAt: string) {
    const ageHours = (Date.now() - new Date(lastScannedAt).getTime()) / (1000 * 60 * 60);
    const isFresh = ageHours < 48;
    console.log(`Scanned: ${lastScannedAt} | Age: ${ageHours.toFixed(1)}h | Fresh: ${isFresh}`);
    return isFresh;
}

console.log("=== FRESHNESS TEST ===");
checkFreshness(new Date().toISOString());
checkFreshness(new Date(Date.now() - (24 * 60 * 60 * 1000)).toISOString());
checkFreshness(new Date(Date.now() - (47 * 60 * 60 * 1000)).toISOString());
checkFreshness(new Date(Date.now() - (49 * 60 * 60 * 1000)).toISOString());
checkFreshness(new Date(Date.now() - (100 * 60 * 60 * 1000)).toISOString());
