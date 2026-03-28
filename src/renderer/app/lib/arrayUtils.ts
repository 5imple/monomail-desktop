export function removeElements<T>(arr1: T[], arr2: T[]): T[] {
  return arr1.filter((item) => !arr2.includes(item));
}
export function combineElements<T>(arr1: T[], arr2: T[]): T[] {
  const filteredArr1 = arr1.filter((item) => !arr2.includes(item));
  return [...filteredArr1, ...arr2];
}
