import { hash, verify } from "argon2";

const myCrypt = {
	verify: async ({ password, hash }: { password: string; hash: string; }) => {
		const v = await verify(hash, password);
		// console.log({ v, hash, password });
		return v;

	},
	hashed: async ({ password }: { password: string; }) => {
		const h = await hash(password);
		// console.log({ h, password });
		return h;

	},
};

export default myCrypt;
