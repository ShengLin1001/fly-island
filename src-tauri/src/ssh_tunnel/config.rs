//! Which hosts get a proxy tunnel, and on which port there, kept in `ssh-tunnels.json` in the app
//! data folder; the local proxy port is a setting of the built-in plugin. A host switched off
//! keeps its port; one without a port has no entry.

use std::{fs, path::Path};

use serde::{Deserialize, Serialize};

use crate::agent_status::remote_hosts::is_valid_alias;

pub(super) const FILE_NAME: &str = "ssh-tunnels.json";
/// More than the SSH list holds (Host aliases plus 16 added computers) would be a broken file.
const MAX_HOSTS: usize = 32;
/// Below 1024 only root may listen on a Linux server.
pub(super) const MIN_REMOTE_PORT: u16 = 1024;

/// One host's tunnel: `-R 127.0.0.1:<remote_port>` there to the local proxy here.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct HostTunnel {
    pub(super) host: String,
    pub(super) enabled: bool,
    pub(super) remote_port: u16,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct TunnelsFile {
    #[serde(default)]
    hosts: Vec<HostTunnel>,
}

fn is_valid(tunnel: &HostTunnel) -> bool {
    is_valid_alias(&tunnel.host) && tunnel.remote_port >= MIN_REMOTE_PORT
}

/// The hosts with a port; none when the file is missing or unreadable.
pub(super) fn read(app_dir: &Path) -> Vec<HostTunnel> {
    let file = fs::read_to_string(app_dir.join(FILE_NAME))
        .ok()
        .and_then(|text| serde_json::from_str::<TunnelsFile>(&text).ok())
        .unwrap_or_default();
    let mut hosts: Vec<HostTunnel> = Vec::new();
    for tunnel in file.hosts.into_iter().filter(is_valid) {
        if !hosts.iter().any(|known| known.host == tunnel.host) {
            hosts.push(tunnel);
        }
    }
    hosts.truncate(MAX_HOSTS);
    hosts
}

/// Saves `host`'s switch and port; no port removes it, and it cannot then be on.
pub(super) fn set(app_dir: &Path, host: &str, enabled: bool, remote_port: Option<u16>) -> Result<Vec<HostTunnel>, String> {
    let host = host.trim();
    if !is_valid_alias(host) {
        return Err(format!("\"{host}\" is not an SSH host name"));
    }
    let mut hosts = read(app_dir);
    let index = hosts.iter().position(|known| known.host == host);
    match (remote_port, index) {
        (None, _) if enabled => return Err(format!("Set the port on {host} first")),
        (None, Some(index)) => {
            hosts.remove(index);
        }
        (None, None) => {}
        (Some(port), _) if port < MIN_REMOTE_PORT => return Err(format!("The port on the server must be {MIN_REMOTE_PORT}–65535")),
        (Some(remote_port), Some(index)) => hosts[index] = HostTunnel { host: host.to_string(), enabled, remote_port },
        (Some(_), None) if hosts.len() >= MAX_HOSTS => return Err(format!("At most {MAX_HOSTS} hosts")),
        (Some(remote_port), None) => hosts.push(HostTunnel { host: host.to_string(), enabled, remote_port }),
    }
    let text = serde_json::to_string_pretty(&TunnelsFile { hosts: hosts.clone() }).map_err(|error| error.to_string())?;
    fs::create_dir_all(app_dir).map_err(|error| format!("Failed to create the app data folder: {error}"))?;
    fs::write(app_dir.join(FILE_NAME), text).map_err(|error| format!("Failed to save the tunnels: {error}"))?;
    Ok(hosts)
}
