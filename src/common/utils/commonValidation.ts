import { z } from "zod";

const validFlagRegex = /^[a-zA-Z\/\\.\-_=\ \d]*$/;


export const commonValidations = {
	id: z
		.string()
		.refine((data) => !Number.isNaN(Number(data)), "ID must be a numeric value")
		.transform(Number)
		.refine((num) => num > 0, "ID must be a positive number"),
	validFlag: z.string().refine((data) => validFlagRegex.test(data), "Invalid flag"),
};
