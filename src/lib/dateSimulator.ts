
const SIMULATED_DATE_KEY = 'vantage_simulated_date';

export const setSimulatedDate = (dateString: string | null) => {
  if (dateString) {
    localStorage.setItem(SIMULATED_DATE_KEY, dateString);
  } else {
    localStorage.removeItem(SIMULATED_DATE_KEY);
  }
};

export const getSimulatedDate = (): Date => {
  const simulated = localStorage.getItem(SIMULATED_DATE_KEY);
  return simulated ? new Date(simulated) : new Date();
};

export const toLocalDateString = (dateInput: any): string => {
  if (!dateInput) return '';
  const date = typeof dateInput === 'string' || typeof dateInput === 'number'
    ? new Date(dateInput)
    : (dateInput.toDate ? dateInput.toDate() : dateInput);
  if (isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getLocalTodayString = (): string => {
  return toLocalDateString(getSimulatedDate());
};

export const getLocalCurrentMonthString = (): string => {
  return getLocalTodayString().substring(0, 7);
};

