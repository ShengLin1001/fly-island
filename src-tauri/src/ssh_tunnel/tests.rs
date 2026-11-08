use std::{fs, path::Path, time::Duration};

use serde_json::{json, Map, Value};

use super::config::{self, HostTunnel, FILE_NAME};
use super::local_port;
use super::tunnel::{backoff, hear, port_listening, ssh_args, Heard};

fn temp_dir(tag: &str) -> std::path::PathBuf {
    std::env::temp_dir().join(format!("focusd-ssh-tunnels-{tag}-{}", std::process::id()))
}

fn cleanup(dir: &Path) {
    let _ = fs::remove_file(dir.join(FILE_NAME));
    let _ = fs::remove_dir(dir);
}

fn settings(value: Value) -> Map<String, Value> {
    value.as_object().cloned().unwrap_or_default()
}

#[test]
fn the_local_proxy_port_follows_the_choice() {
    assert_eq!(local_port(&settings(json!({ "localProxy": "clash-verge", "customPort": 1 }))), Ok(7897));
    assert_eq!(local_port(&settings(json!({ "localProxy": "v2rayn" }))), Ok(10808));
    assert_eq!(local_port(&settings(json!({ "localProxy": "custom", "customPort": 8118 }))), Ok(8118));
    assert_eq!(local_port(&Map::new()), Ok(7897));
    for bad in [json!(0), json!(65_536), json!(80.5), json!("8118")] {
        assert!(local_port(&settings(json!({ "localProxy": "custom", "customPort": bad }))).is_err());
    }
}

#[test]
fn hosts_keep_their_port_when_switched_off_and_lose_it_when_cleared() {
    let dir = temp_dir("set");
    let zcm6 = |enabled| HostTunnel { host: "zcm6".into(), enabled, remote_port: 10_089 };
    assert_eq!(config::set(&dir, " zcm6 ", true, Some(10_089)).unwrap(), [zcm6(true)]);
    config::set(&dir, "a6", false, Some(20_089)).unwrap();
    assert_eq!(config::set(&dir, "zcm6", false, Some(10_089)).unwrap()[0], zcm6(false));
    // Order stays as first saved.
    assert_eq!(config::read(&dir).iter().map(|tunnel| tunnel.host.as_str()).collect::<Vec<_>>(), ["zcm6", "a6"]);
    assert_eq!(config::set(&dir, "zcm6", false, None).unwrap().len(), 1);
    assert_eq!(config::read(&dir)[0].host, "a6");
    cleanup(&dir);
}

#[test]
fn bad_hosts_and_ports_are_refused() {
    let dir = temp_dir("refuse");
    assert!(config::set(&dir, "-oProxyCommand=calc", true, Some(10_089)).is_err());
    assert!(config::set(&dir, "a b", true, Some(10_089)).is_err());
    assert!(config::set(&dir, "zcm6", true, Some(1023)).is_err());
    assert!(config::set(&dir, "zcm6", true, None).is_err());
    assert!(config::read(&dir).is_empty());
    cleanup(&dir);
}

#[test]
fn a_file_with_bad_or_repeated_entries_reads_what_is_good() {
    let dir = temp_dir("read");
    fs::create_dir_all(&dir).unwrap();
    let text = r#"{ "hosts": [
        { "host": "zcm6", "enabled": true, "remotePort": 10089 },
        { "host": "zcm6", "enabled": false, "remotePort": 10090 },
        { "host": "-x", "enabled": true, "remotePort": 10089 },
        { "host": "a6", "enabled": true, "remotePort": 80 }
    ] }"#;
    fs::write(dir.join(FILE_NAME), text).unwrap();
    assert_eq!(config::read(&dir), [HostTunnel { host: "zcm6".into(), enabled: true, remote_port: 10_089 }]);
    fs::write(dir.join(FILE_NAME), "not json").unwrap();
    assert!(config::read(&dir).is_empty());
    cleanup(&dir);
}

#[test]
fn the_tunnel_forwards_the_server_loopback_port_to_the_local_proxy() {
    let args = ssh_args(10_089, 7897, "zcm6");
    let joined = args.join(" ");
    assert!(joined.starts_with("-N -T -v "));
    assert!(joined.contains("-o BatchMode=yes") && joined.contains("-o ExitOnForwardFailure=yes") && joined.contains("-o ServerAliveInterval=10"));
    assert!(joined.ends_with("-R 127.0.0.1:10089:127.0.0.1:7897 -- zcm6"));
}

#[test]
fn what_ssh_says_tells_up_port_taken_and_the_reason_it_ended() {
    assert_eq!(hear("debug1: remote forward success for: listen 127.0.0.1:10089, connect 127.0.0.1:7897"), Heard::Up);
    assert_eq!(hear("Error: remote port forwarding failed for listen port 10089"), Heard::PortTaken);
    assert_eq!(hear("Permission denied (publickey)."), Heard::Said("Permission denied (publickey).".into()));
    for noise in ["debug1: channel 1: new [127.0.0.1]", "OpenSSH_for_Windows_9.5p1, LibreSSL 3.8.2", "** WARNING: connection is not using a post-quantum key exchange algorithm.", "  "] {
        assert_eq!(hear(noise), Heard::Noise, "{noise}");
    }
}

#[test]
fn listening_ports_are_read_from_netstat_and_ss() {
    // netstat on zcm6 (CentOS 7): the user's own tunnel listens on 37897.
    let netstat = "Active Internet connections (only servers)\n\
        Proto Recv-Q Send-Q Local Address           Foreign Address         State      \n\
        tcp        0      0 127.0.0.1:6034          0.0.0.0:*               LISTEN     \n\
        tcp        0      0 127.0.0.1:37897         0.0.0.0:*               LISTEN     \n\
        tcp6       0      0 ::1:6010                :::*                    LISTEN     \n";
    assert_eq!(port_listening(netstat, 37_897), Ok(true));
    assert_eq!(port_listening(netstat, 6010), Ok(true));
    assert_eq!(port_listening(netstat, 10_089), Ok(false));
    assert_eq!(port_listening(netstat, 7897), Ok(false), "37897 is not 7897");
    let ss = "State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process\n\
        LISTEN 0      128        127.0.0.1:10089      0.0.0.0:*\n\
        LISTEN 0      128            [::1]:20089         [::]:*\n";
    assert_eq!(port_listening(ss, 10_089), Ok(true));
    assert_eq!(port_listening(ss, 20_089), Ok(true));
    assert_eq!(port_listening(ss, 128), Ok(false));
    assert!(port_listening("FOCUSD_NO_PORT_TOOL\n", 10_089).is_err());
}

#[test]
fn retries_wait_longer_up_to_two_minutes() {
    let seconds: Vec<u64> = (1..=8).map(|failures| backoff(failures).as_secs()).collect();
    assert_eq!(seconds, [5, 10, 20, 40, 80, 120, 120, 120]);
    assert_eq!(backoff(0), Duration::from_secs(5));
    assert_eq!(backoff(u32::MAX), Duration::from_secs(120));
}

/// Starts real ssh processes, against nothing: `cargo test --lib ssh_tunnel -- --ignored`.
#[test]
#[ignore = "starts ssh"]
fn a_tunnel_says_why_it_failed_and_ends_its_ssh_when_stopped() {
    use super::tunnel::{supervise, Spec, Status};
    use crate::agent_status::remote_hosts::SshTarget;
    use std::sync::{mpsc, Arc, Mutex};
    use std::time::Instant;

    let dir = temp_dir("run");
    let run = |destination: &str, port: u16| {
        let spec = Spec { host: "nowhere".into(), target: SshTarget { destination: destination.into(), port: Some(port) }, remote_port: 10_089, local_port: 7897 };
        let status = Arc::new(Mutex::new(Status::Connecting));
        let (stop, stopped) = mpsc::channel::<()>();
        let (dir, thread_status) = (dir.clone(), Arc::clone(&status));
        let thread = std::thread::spawn(move || supervise(&dir, &spec, &thread_status, &stopped));
        (status, stop, thread)
    };

    // Nothing listens on port 9 here: ssh ends at once and says so.
    let (status, stop, thread) = run("127.0.0.1", 9);
    let deadline = Instant::now() + Duration::from_secs(20);
    while *status.lock().unwrap() == Status::Connecting && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(100));
    }
    let seen = status.lock().unwrap().clone();
    drop(stop);
    thread.join().unwrap();
    assert!(matches!(&seen, Status::Failed(reason) if reason.contains("refused")), "{seen:?}");

    // An address that never answers: stopping mid-connect ends ssh within a poll.
    let (status, stop, thread) = run("10.255.255.1", 22);
    std::thread::sleep(Duration::from_secs(2));
    let stopping = Instant::now();
    drop(stop);
    thread.join().unwrap();
    println!("stopped in {:?}", stopping.elapsed());
    assert!(stopping.elapsed() < Duration::from_secs(2));
    assert_eq!(*status.lock().unwrap(), Status::Connecting);

    let _ = fs::remove_file(dir.join("ssh").join("tunnel-nowhere.conf"));
    let _ = fs::remove_dir(dir.join("ssh"));
    let _ = fs::remove_dir(&dir);
}
