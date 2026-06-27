import bcrypt from "bcrypt";

const SALT_ROUNDS = 12;

const myCrypt = {
  verify: async ({ password, hash }: { password: string; hash: string }) => {
    return bcrypt.compare(password, hash);
  },

  hashed: async ({ password }: { password: string }) => {
    return bcrypt.hash(password, SALT_ROUNDS);
  },
};

export default myCrypt;
