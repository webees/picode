/** Default tool profiles (spec 09). Overridable via config later. */

export type ToolName =
  | "bus_post"
  | "bus_history"
  | "repo_read"
  | "repo_write"
  | "repo_glob"
  | "repo_grep"
  | "git_status"
  | "git_diff"
  | "git_log"
  | "git_commit"
  | "run_allowlisted"
  | "web_search"
  | "web_fetch"
  | "request_info"
  | "request_cross_room"
  | "progress_report"
  | "state_read";

export interface ToolProfile {
  allow: ToolName[];
  repo_write_mode?: "write_paths" | "none";
}

const PROFILES: Record<string, ToolProfile> = {
  "governance.sess-mgr": {
    allow: [
      "bus_post",
      "bus_history",
      "state_read",
      "progress_report",
      "request_info",
    ],
  },
  "product.pm": {
    allow: [
      "bus_post",
      "bus_history",
      "repo_read",
      "request_info",
      "progress_report",
      "state_read",
    ],
  },
  "governance.run-lead": {
    allow: [
      "bus_post",
      "bus_history",
      "repo_read",
      "repo_glob",
      "repo_grep",
      "request_info",
      "request_cross_room",
      "progress_report",
      "state_read",
    ],
  },
  "governance.tpm": {
    allow: [
      "bus_post",
      "bus_history",
      "repo_read",
      "request_info",
      "progress_report",
      "state_read",
    ],
  },
  "governance.proc-audit": {
    allow: ["bus_post", "bus_history", "repo_read", "repo_glob", "state_read"],
  },
  "implement.squad-lead": {
    allow: [
      "bus_post",
      "bus_history",
      "repo_read",
      "repo_glob",
      "git_status",
      "git_diff",
      "git_log",
      "git_commit",
      "request_info",
      "request_cross_room",
      "progress_report",
      "state_read",
    ],
  },
  "implement.engineer": {
    allow: [
      "bus_post",
      "bus_history",
      "repo_read",
      "repo_write",
      "repo_glob",
      "repo_grep",
      "git_status",
      "git_diff",
      "git_log",
      "git_commit",
      "request_info",
      "state_read",
    ],
    repo_write_mode: "write_paths",
  },
  "implement.sdet": {
    allow: [
      "bus_post",
      "bus_history",
      "repo_read",
      "repo_glob",
      "run_allowlisted",
      "request_info",
      "state_read",
      "git_status",
      "git_diff",
    ],
    repo_write_mode: "none",
  },
  "research.ind-res": {
    allow: [
      "bus_post",
      "bus_history",
      "repo_read",
      "web_search",
      "web_fetch",
      "request_info",
      "state_read",
      "progress_report",
    ],
  },
  "docs.doer": {
    allow: [
      "bus_post",
      "bus_history",
      "repo_read",
      "request_info",
      "state_read",
      "progress_report",
    ],
  },
  "docs.lead": {
    allow: ["bus_post", "bus_history", "repo_read", "state_read", "progress_report"],
  },
  "docs.check": {
    allow: ["bus_post", "bus_history", "repo_read", "state_read"],
  },
  "human.sponsor": {
    allow: ["bus_post", "bus_history", "state_read"],
  },
  "people.lead": {
    allow: [
      "bus_post",
      "bus_history",
      "repo_read",
      "request_info",
      "progress_report",
      "state_read",
    ],
  },
  "people.doer": {
    allow: [
      "bus_post",
      "bus_history",
      "repo_read",
      "request_info",
      "state_read",
      "progress_report",
    ],
  },
  "people.check": {
    allow: ["bus_post", "bus_history", "repo_read", "state_read"],
  },
  "architecture.scout": {
    allow: ["bus_post", "bus_history", "repo_read", "repo_glob", "repo_grep", "state_read"],
  },
  "architecture.sys-arch": {
    allow: ["bus_post", "bus_history", "repo_read", "repo_glob", "repo_grep", "state_read", "request_info"],
  },
  "gate.code-review": {
    allow: ["bus_post", "bus_history", "repo_read", "repo_glob", "repo_grep", "git_diff", "state_read"],
  },
  "gate.release-eng": {
    allow: [
      "bus_post",
      "bus_history",
      "repo_read",
      "run_allowlisted",
      "git_status",
      "git_diff",
      "git_log",
      "state_read",
      "progress_report",
    ],
  },
  "gate.sec-eng": {
    allow: ["bus_post", "bus_history", "repo_read", "repo_glob", "repo_grep", "state_read"],
  },
};

export function getToolProfile(name: string): ToolProfile {
  const p = PROFILES[name];
  if (!p) {
    return { allow: ["bus_history", "state_read"], repo_write_mode: "none" };
  }
  return p;
}

export function profileAllows(profileName: string, tool: ToolName): boolean {
  return getToolProfile(profileName).allow.includes(tool);
}
