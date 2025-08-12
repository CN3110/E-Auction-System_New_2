const generateBidderId = (lastId) => {
  if (!lastId) return 'B001';
  const num = parseInt(lastId.substring(1)) + 1;
  return 'B' + num.toString().padStart(3, '0');
};

const generateAuctionId = (lastId) => {
  if (!lastId) return 'AUC1001';
  const num = parseInt(lastId.substring(3)) + 1;
  return 'AUC' + num.toString();
};

const generatePassword = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let password = '';
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

module.exports = {
  generateBidderId,
  generateAuctionId,
  generatePassword
};