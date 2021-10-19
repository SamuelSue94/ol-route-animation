// padNum: 1 => 01
export const padNum = (num: number, length: number = 2) => {
  const numStr = num.toString();
  if (numStr.length >= length) return numStr;
  return new Array(length - numStr.length).fill(0).join('') + numStr;
}
// 毫秒数格式化为xx:xx的字符串
export const formatTimeStr = (time: number) => {
  const seconds = Math.floor(time / 1000);
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    const resSeconds = seconds % 60;
    return `${minutes > 10 ? minutes : padNum(minutes, 2)}` + ":" + `${resSeconds > 10 ? resSeconds : padNum(resSeconds)}`
  }
  return `00:${seconds > 10 ? seconds : padNum(seconds)}`
}