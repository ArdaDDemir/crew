/// Sidecar prints `crew ui  http://127.0.0.1:<port>`.
pub fn parse_listen_url(line: &str) -> Option<String> {
    let rest = line.trim().strip_prefix("crew ui")?.trim();
    let rest = rest.strip_suffix('/').unwrap_or(rest);
    let prefix = "http://127.0.0.1:";
    let port = rest.strip_prefix(prefix)?;
    if port.is_empty() || !port.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let n: u32 = port.parse().ok()?;
    if n < 1 || n > 65535 {
        return None;
    }
    Some(format!("{prefix}{n}"))
}

#[cfg(test)]
mod tests {
    use super::parse_listen_url;

    #[test]
    fn two_spaces_and_trailing_slash() {
        assert_eq!(
            parse_listen_url("crew ui  http://127.0.0.1:7734"),
            Some("http://127.0.0.1:7734".into())
        );
        assert_eq!(
            parse_listen_url("crew ui  http://127.0.0.1:7734/\n"),
            Some("http://127.0.0.1:7734".into())
        );
    }

    #[test]
    fn rejects_non_loopback_and_path() {
        assert_eq!(parse_listen_url("crew ui  http://0.0.0.0:7734"), None);
        assert_eq!(parse_listen_url("crew ui  http://127.0.0.1:7734/admin"), None);
        assert_eq!(parse_listen_url("listening 7734"), None);
    }
}
