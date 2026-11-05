//! URL slugs: ASCII, lowercase, hyphenated, unique, never a reserved word.

use std::collections::{HashMap, HashSet};

/// Path segments under /time/ that a city may never take.
pub const RESERVED: &[&str] = &["country"];

pub fn slugify(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
        } else if !out.ends_with('-') {
            out.push('-');
        }
    }
    out.trim_matches('-').to_owned()
}

pub struct SlugInput<'a> {
    pub id: u32,
    pub ascii: &'a str,
    pub admin1_ascii: &'a str,
    pub cc: &'a str,
    pub country: &'a str,
    /// A fixed slug (existing URL that must not change).
    pub pinned: Option<&'a str>,
}

/// Unique slugs in input order. Same name in different countries -> `name-country`;
/// same name inside one country -> `name-region`; anything still clashing -> `-<geonameid>`.
pub fn assign(items: &[SlugInput]) -> Vec<String> {
    let base: Vec<String> = items
        .iter()
        .map(|it| {
            let b = slugify(it.ascii);
            if b.is_empty() { it.id.to_string() } else { b }
        })
        .collect();
    let mut taken: HashSet<String> = RESERVED.iter().map(|s| (*s).to_owned()).collect();
    taken.extend(items.iter().filter_map(|it| it.pinned.map(str::to_owned)));

    let mut groups: HashMap<&str, Vec<usize>> = HashMap::new();
    for (i, it) in items.iter().enumerate() {
        if it.pinned.is_none() {
            groups.entry(base[i].as_str()).or_default().push(i);
        }
    }

    let mut out: Vec<String> = items
        .iter()
        .map(|it| it.pinned.unwrap_or_default().to_owned())
        .collect();
    for (b, idx) in &groups {
        let clash = idx.len() > 1 || taken.contains(*b);
        if !clash {
            out[idx[0]] = (*b).to_owned();
            continue;
        }
        let ccs: HashSet<&str> = idx.iter().map(|&i| items[i].cc).collect();
        let all_countries_differ = ccs.len() == idx.len();
        for &i in idx {
            let it = &items[i];
            let qualifier = if all_countries_differ || it.admin1_ascii.is_empty() {
                slugify(it.country)
            } else {
                slugify(it.admin1_ascii)
            };
            out[i] = if qualifier.is_empty() {
                format!("{b}-{}", it.id)
            } else {
                format!("{b}-{qualifier}")
            };
        }
    }

    // Final pass: anything still duplicated (or reserved) gets its id appended.
    let mut count: HashMap<String, usize> = HashMap::new();
    for s in &out {
        *count.entry(s.clone()).or_default() += 1;
    }
    for (i, it) in items.iter().enumerate() {
        if it.pinned.is_none()
            && (count.get(&out[i]).copied().unwrap_or(0) > 1 || RESERVED.contains(&out[i].as_str()))
        {
            out[i] = format!("{}-{}", out[i], it.id);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn it<'a>(
        id: u32,
        ascii: &'a str,
        adm: &'a str,
        cc: &'a str,
        country: &'a str,
    ) -> SlugInput<'a> {
        SlugInput {
            id,
            ascii,
            admin1_ascii: adm,
            cc,
            country,
            pinned: None,
        }
    }

    #[test]
    fn slugify_basics() {
        assert_eq!(slugify("Sao Paulo"), "sao-paulo");
        assert_eq!(slugify("  St. John's -- Town "), "st-john-s-town");
        assert_eq!(slugify("Ho Chi Minh City"), "ho-chi-minh-city");
        assert_eq!(slugify("???"), "");
    }

    #[test]
    fn unique_names_stay_plain() {
        let s = assign(&[
            it(1, "Karachi", "Sindh", "PK", "Pakistan"),
            it(2, "Lahore", "Punjab", "PK", "Pakistan"),
        ]);
        assert_eq!(s, vec!["karachi", "lahore"]);
    }

    #[test]
    fn same_name_different_countries_uses_country() {
        let s = assign(&[
            it(1, "Hyderabad", "Telangana", "IN", "India"),
            it(2, "Hyderabad", "Sindh", "PK", "Pakistan"),
        ]);
        assert_eq!(s, vec!["hyderabad-india", "hyderabad-pakistan"]);
    }

    #[test]
    fn same_name_same_country_uses_region_then_id() {
        let s = assign(&[
            it(1, "Springfield", "Illinois", "US", "United States"),
            it(2, "Springfield", "Missouri", "US", "United States"),
            it(3, "Springfield", "Missouri", "US", "United States"),
        ]);
        assert_eq!(s[0], "springfield-illinois");
        assert_eq!(s[1], "springfield-missouri-2");
        assert_eq!(s[2], "springfield-missouri-3");
    }

    #[test]
    fn pinned_and_reserved_slugs_are_respected() {
        let mut a = it(1, "New York City", "New York", "US", "United States");
        a.pinned = Some("new-york");
        let b = it(2, "New York", "Lincolnshire", "GB", "United Kingdom");
        let c = it(3, "Country", "", "XX", "Nowhere");
        let s = assign(&[a, b, c]);
        assert_eq!(s[0], "new-york");
        assert_eq!(s[1], "new-york-united-kingdom");
        assert_eq!(s[2], "country-nowhere");
    }
}
