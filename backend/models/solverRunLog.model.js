const mongoose = require("mongoose");

/**
 * One document per scheduling run, written by the PYTHON scheduler service
 * (../../schudeler-API/scheduler/runlog.py). Node only ever reads these.
 *
 * The solver's `warnings[]` used to live for the length of one HTTP response and
 * then vanish, which is how a silent "defaulted to Two Majors" decision went
 * unnoticed for weeks. Now every run - successful, infeasible or rejected -
 * leaves a row here, and `academicterms.solverLogs.phase<N>` carries a compact
 * index of them.
 *
 * `strict: false` on purpose: Python owns the write schema, so a field added
 * there must survive a read here rather than being silently dropped. For the
 * same reason nothing in this model is `required` - it describes what Python
 * writes today, it does not police it.
 */
const solverRunLogSchema = new mongoose.Schema(
  {
    // Identity is repeated on both sides of the link (here and in the term's
    // solverLogs entry) so a log found from either direction says which term
    // and phase it belongs to and can never be orphaned.
    runKey: { type: String, index: true },   // "2026-09-02-run1"
    runDate: { type: String },               // "2026-09-02", the counter's scope
    termId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicTerm", index: true },
    termName: { type: String },
    phaseNumber: { type: Number, index: true },
    levels: { type: [Number], default: [] },

    startedAt: { type: Date },
    finishedAt: { type: Date },
    durationSeconds: { type: Number },

    status: { type: String },        // done | validation_error | infeasible | failed | error
    solverStatus: { type: String },  // OPTIMAL | FEASIBLE | INFEASIBLE | ...
    message: { type: String },

    warningCount: { type: Number, default: 0 },
    warnings: { type: [String], default: [] },

    // Course codes are capped by the writer (runlog.MAX_CODES_PER_LIST); the
    // counts are always exact, which is why both are stored.
    excluded: { type: Object },
    excludedCounts: { type: Object },

    summary: { type: Object },
    verifier: { type: Object },
    write: { type: Object },
    config: { type: Object },
  },
  {
    strict: false,
    timestamps: false,
    collection: "solverrunlogs",
    // autoIndex OFF deliberately. With it on, merely requiring this model
    // makes Mongoose build the indexes below on connect - which CREATES the
    // collection, on production, before a single run has happened. Python is
    // the only writer and creates the collection on its first insert; the
    // indexes below are documentation until someone builds them on purpose
    // (SolverRunLog.syncIndexes(), or by hand in Atlas).
    autoIndex: false,
    // autoCreate is a SEPARATE switch from autoIndex, and it is the one that
    // actually calls createCollection() on init. With only autoIndex off, an
    // empty `solverrunlogs` collection still appeared in production the
    // moment the server booted. Both must be false for requiring this model
    // to be genuinely read-only.
    autoCreate: false,
  }
);

// The natural key of a run. Not unique: Python is the only writer and already
// serialises runs, and a unique index created from here could fail against
// data written before it existed. Inert while autoIndex is false - see above.
solverRunLogSchema.index({ termId: 1, phaseNumber: 1, runKey: 1 });

module.exports = mongoose.model("SolverRunLog", solverRunLogSchema);
