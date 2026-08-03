const express = require("express");
const router = express.Router();
const SCHEDULER_URL = process.env.SCHEDULER_URL || "http://localhost:8000";

router.post("/generate", async(req, res) => {
    // The scheduler requires termId (non-empty string) and phaseNumber (integer 0-9).
    const termId = String(req.body && req.body.termId || "").trim();
    if (!termId) {
        return res.status(400).json({ message: "termId is required" });
    }

    const phaseNumber = Number(req.body && req.body.phaseNumber);
    if (!Number.isInteger(phaseNumber) || phaseNumber < 0 || phaseNumber > 2) {
        return res.status(400).json({ message: "phaseNumber must be an integer between 0 and 9" });
    }

    const payload = { termId, phaseNumber };

    try {
        const r = await fetch(`${SCHEDULER_URL}/solve`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        res.status(r.status).json(await r.json());
    } catch (err) {
        res.status(502).json({ message: `Scheduler unreachable: ${err.message}` });
    }
});

router.get("/jobs/:id", async(req, res) => {
    try {
        const r = await fetch(`${SCHEDULER_URL}/jobs/${req.params.id}`);
        res.status(r.status).json(await r.json());
    } catch (err) {
        res.status(502).json({ message: `Scheduler unreachable: ${err.message}` });
    }
});

router.get("/day-scores", async(req, res) => {
    try {
        const { courseCode, examType, termId } = req.query;
        const qs = new URLSearchParams({ courseCode, examType, termId }).toString();
        const r = await fetch(`${SCHEDULER_URL}/day-scores?${qs}`);
        res.status(r.status).json(await r.json());
    } catch (err) {
        res.status(502).json({ message: `Scheduler unreachable: ${err.message}` });
    }
});

module.exports = router;