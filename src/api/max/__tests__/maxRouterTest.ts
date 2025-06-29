import { StatusCodes } from "http-status-codes";
import request from "supertest";

import type { ServiceResponse } from "@/common/models/serviceResponse";
import { app } from "@/server";

describe("Health Check API endpoints", () => {
	it("GET /version - success", async () => {
		const response = await request(app).get("/max/version");
		const result: ServiceResponse = response.body;

		expect(response.statusCode).toEqual(StatusCodes.OK);
		expect(result.success).toBeTruthy();
		expect(result.responseObject).toBeNull();
		expect(result.message).toContain("MAX 25");
	});
});
