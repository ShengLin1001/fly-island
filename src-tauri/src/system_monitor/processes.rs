//! The busiest processes, with every process of the same program added up (a browser's dozens).

use std::collections::HashMap;

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProcessUsage {
    /// The program's file name without ".exe".
    pub(crate) name: String,
    /// Share of the whole CPU, 0-100.
    pub(crate) cpu: f32,
    /// Working set in bytes.
    pub(crate) memory: u64,
    /// How many processes were added up.
    pub(crate) count: u32,
}

/// The `limit` programs using the most CPU, and the `limit` using the most memory, from
/// `(file name, CPU share, memory)` per process.
pub(super) fn top(processes: impl Iterator<Item = (String, f32, u64)>, limit: usize) -> (Vec<ProcessUsage>, Vec<ProcessUsage>) {
    let mut programs: HashMap<String, ProcessUsage> = HashMap::new();
    for (file, cpu, memory) in processes {
        let name = file.strip_suffix(".exe").or_else(|| file.strip_suffix(".EXE")).unwrap_or(&file).to_owned();
        let program = programs.entry(name.to_ascii_lowercase()).or_insert(ProcessUsage { name, cpu: 0.0, memory: 0, count: 0 });
        program.cpu += cpu;
        program.memory += memory;
        program.count += 1;
    }
    let mut by_cpu: Vec<ProcessUsage> = programs.into_values().collect();
    let mut by_memory = by_cpu.clone();
    by_cpu.sort_by(|a, b| b.cpu.total_cmp(&a.cpu).then_with(|| b.memory.cmp(&a.memory)));
    by_memory.sort_by_key(|program| std::cmp::Reverse(program.memory));
    by_cpu.truncate(limit);
    by_memory.truncate(limit);
    (by_cpu, by_memory)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn processes_of_one_program_are_added_up_and_ranked() {
        let listed = [
            ("chrome.exe", 3.0, 300),
            ("Chrome.exe", 2.0, 200),
            ("code.exe", 4.0, 100),
            ("idle", 0.0, 900),
        ]
        .map(|(name, cpu, memory)| (name.to_owned(), cpu, memory));
        let (by_cpu, by_memory) = top(listed.into_iter(), 2);
        assert_eq!(by_cpu.iter().map(|p| (p.name.as_str(), p.cpu, p.count)).collect::<Vec<_>>(), [("chrome", 5.0, 2), ("code", 4.0, 1)]);
        assert_eq!(by_memory.iter().map(|p| (p.name.as_str(), p.memory)).collect::<Vec<_>>(), [("idle", 900), ("chrome", 500)]);
    }
}
