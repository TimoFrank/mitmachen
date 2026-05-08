const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000";

async function run() {
  const loginResponse = await fetch(`${baseUrl}/login`, {
    redirect: "manual"
  });

  if (!loginResponse.ok) {
    throw new Error(`Expected /login to return 200, got ${loginResponse.status}`);
  }

  const dashboardResponse = await fetch(`${baseUrl}/`, {
    redirect: "manual"
  });

  if (![302, 307].includes(dashboardResponse.status)) {
    throw new Error(`Expected / to redirect, got ${dashboardResponse.status}`);
  }

  console.log("Smoke test passed.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
