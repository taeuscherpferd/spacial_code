//! Imports between stylesheets: CSS `@import` and Sass `@use` / `@forward` / `@import`.

const IMPORT_RULES: &[&str] = &["@import", "@use", "@forward"];

/// Quoted targets of import rules, in order. Unquoted `url(...)` targets are skipped.
pub(crate) fn style_imports(source: &str) -> Vec<String> {
    let mut imports = Vec::new();
    for line in source.lines() {
        let line = line.trim_start();
        let Some((rule, mut rest)) = IMPORT_RULES
            .iter()
            .find_map(|rule| Some((*rule, line.strip_prefix(rule)?)))
        else {
            continue;
        };
        if !rest.starts_with(|next: char| next.is_whitespace() || next == '"' || next == '\'') {
            // `@imports-like` identifiers, not a rule.
            continue;
        }
        loop {
            rest = rest.trim_start();
            rest = rest.strip_prefix("url(").unwrap_or(rest).trim_start();
            let Some(quote) = rest
                .chars()
                .next()
                .filter(|next| matches!(next, '"' | '\''))
            else {
                break;
            };
            let Some(end) = rest[1..].find(quote) else {
                break;
            };
            imports.push(rest[1..1 + end].to_owned());
            rest = rest[end + 2..].trim_start();
            rest = rest.strip_prefix(')').unwrap_or(rest);
            // Only `@import` takes a comma-separated list.
            match rest.trim_start().strip_prefix(',') {
                Some(next) if rule == "@import" => rest = next,
                _ => break,
            }
        }
    }
    imports
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_css_and_sass_imports() {
        let imports = style_imports(
            r#"
@use 'sass:math';
@use "./variables" as vars;
@forward 'mixins' show rounded;
@import 'reset', "theme";
@import url("./fonts.css") screen;
  @import url(unquoted.css);
// @import 'commented';
.button { color: red; }
"#,
        );
        assert_eq!(
            imports,
            vec![
                "sass:math",
                "./variables",
                "mixins",
                "reset",
                "theme",
                "./fonts.css"
            ]
        );
    }
}
