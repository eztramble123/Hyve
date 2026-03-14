// Vesting logic — pure business logic, no XRPL calls.
// All vesting state is in-memory (lost on restart).

/**
 * Calculate vested amount from match deposits based on schedule.
 *
 * @param {Array} matchDeposits - [{ amount, timestamp, txHash }]
 * @param {Object} schedule - { type, periodMonths, totalPeriods, cliffMonths }
 * @param {Date} asOfDate - date to calculate vesting as of
 * @returns {{ vestedAmount, unvestedAmount, vestPercent, nextVestDate, nextVestAmount }}
 */
export function calculateVestedAmount(matchDeposits, schedule, asOfDate = new Date()) {
  if (!matchDeposits || matchDeposits.length === 0) {
    return { vestedAmount: 0, unvestedAmount: 0, vestPercent: 100, nextVestDate: null, nextVestAmount: 0 };
  }

  const totalMatched = matchDeposits.reduce((sum, d) => sum + d.amount, 0);

  if (!schedule || schedule.type === "immediate") {
    return { vestedAmount: totalMatched, unvestedAmount: 0, vestPercent: 100, nextVestDate: null, nextVestAmount: 0 };
  }

  // Linear vesting: each deposit vests independently based on its own timestamp
  let vestedAmount = 0;
  let nextVestDate = null;
  let nextVestAmount = 0;

  for (const deposit of matchDeposits) {
    const depositDate = new Date(deposit.timestamp);
    const monthsElapsed = monthsBetween(depositDate, asOfDate);

    // Cliff check
    if (monthsElapsed < (schedule.cliffMonths || 0)) {
      // Not past cliff — nothing vested from this deposit
      const cliffDate = addMonths(depositDate, schedule.cliffMonths);
      const cliffAmount = deposit.amount * (schedule.cliffMonths / (schedule.periodMonths * schedule.totalPeriods));
      if (!nextVestDate || cliffDate < nextVestDate) {
        nextVestDate = cliffDate;
        nextVestAmount = cliffAmount;
      }
      continue;
    }

    const totalVestMonths = schedule.periodMonths * schedule.totalPeriods;
    const periodsVested = Math.min(
      Math.floor(monthsElapsed / schedule.periodMonths),
      schedule.totalPeriods
    );
    const fractionVested = periodsVested / schedule.totalPeriods;
    vestedAmount += deposit.amount * fractionVested;

    // Next vest date for this deposit
    if (periodsVested < schedule.totalPeriods) {
      const nextPeriodDate = addMonths(depositDate, (periodsVested + 1) * schedule.periodMonths);
      const periodAmount = deposit.amount / schedule.totalPeriods;
      if (!nextVestDate || nextPeriodDate < nextVestDate) {
        nextVestDate = nextPeriodDate;
        nextVestAmount = periodAmount;
      }
    }
  }

  const unvestedAmount = totalMatched - vestedAmount;
  const vestPercent = totalMatched > 0 ? Math.round((vestedAmount / totalMatched) * 100) : 100;

  return {
    vestedAmount: round2(vestedAmount),
    unvestedAmount: round2(unvestedAmount),
    vestPercent,
    nextVestDate: nextVestDate ? nextVestDate.toISOString().split("T")[0] : null,
    nextVestAmount: round2(nextVestAmount),
  };
}

/**
 * Calculate how much employer match to claw back on employee withdrawal.
 *
 * @param {Object} employeeRecord - { matchDeposits, totalMatched }
 * @param {Object} schedule - vesting schedule
 * @param {number} withdrawAmount - RLUSD being withdrawn
 * @param {number} sharePrice - current share price
 * @returns {{ clawbackAmount, reason }}
 */
export function calculateClawbackOnWithdraw(employeeRecord, schedule, withdrawAmount, sharePrice) {
  if (!employeeRecord.matchDeposits || employeeRecord.matchDeposits.length === 0) {
    return { clawbackAmount: 0, reason: null };
  }

  const { unvestedAmount } = calculateVestedAmount(employeeRecord.matchDeposits, schedule);

  if (unvestedAmount <= 0) {
    return { clawbackAmount: 0, reason: null };
  }

  // Clawback all unvested match shares (converted to RLUSD value)
  // In practice, unvested shares are forfeited on any withdrawal
  const clawbackAmount = round2(unvestedAmount);

  return {
    clawbackAmount,
    reason: `Unvested employer match ($${clawbackAmount}) forfeited on withdrawal`,
  };
}

// --- Helpers ---

function monthsBetween(d1, d2) {
  return (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
}

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
