#!/usr/bin/env ruby
# frozen_string_literal: true
# encoding: UTF-8

require "cgi"
require "json"
require "open3"
require "rexml/document"
require "uri"

PROJECT_ROOT = File.expand_path("..", __dir__)
DATA_DIR = File.join(PROJECT_ROOT, "data")
XLSX_SHEET = "xl/worksheets/sheet2.xml"
CACHE_PATH = File.join(DATA_DIR, "geocode-cache.json")
GEOCODER_USER_AGENT = "Versorgungs-CRM-Geocoder/1.0 (local import)"

def extract_assignment(path, prefix)
  text = File.read(path, encoding: "UTF-8")
  text.sub(/\A#{Regexp.escape(prefix)}\s*=\s*/, "").sub(/;\s*\z/, "")
end

def normalize_key(value)
  value.to_s
    .downcase
    .tr("ÄÖÜäöüß", "AOUaous")
    .gsub(/[^a-z0-9]+/, " ")
    .strip
end

def map_category(sector)
  case sector.to_s
  when /Krankenhaus/
    "Krankenhäuser"
  when /Apotheke/
    "Apotheken"
  when /Pflege/
    "Pflegeeinrichtungen"
  else
    "Arztpraxen"
  end
end

def cell_value(cell, ns)
  inline_text = REXML::XPath.first(cell, "a:is/a:t", ns)
  return CGI.unescapeHTML(inline_text.text.to_s.strip) if inline_text

  value = REXML::XPath.first(cell, "a:v", ns)
  value ? value.text.to_s.strip : ""
end

def parse_rows(sheet_xml)
  ns = { "a" => "http://schemas.openxmlformats.org/spreadsheetml/2006/main" }
  doc = REXML::Document.new(sheet_xml)
  headers = {}
  rows = []

  REXML::XPath.each(doc, "//a:sheetData/a:row", ns) do |row|
    row_number = row.attributes["r"].to_i
    values = {}

    REXML::XPath.each(row, "a:c", ns) do |cell|
      ref = cell.attributes["r"]
      column = ref.gsub(/\d+/, "")
      values[column] = cell_value(cell, ns)
    end

    if row_number == 1
      headers = values
      next
    end

    entry = {}
    headers.each do |column, header|
      entry[header] = values.fetch(column, "")
    end
    rows << entry
  end

  rows
end

def build_lookup
  state_labels = JSON.parse(extract_assignment(File.join(DATA_DIR, "state-labels.js"), "window.MAP_STATE_LABELS"))

  lookup = {}
  state_labels.each do |entry|
    lookup[normalize_key(entry["name"])] ||= { lat: entry["lat"], lon: entry["lon"], source: "state" }
  end
  lookup
end

def load_geocode_cache
  return {} unless File.exist?(CACHE_PATH)

  JSON.parse(File.read(CACHE_PATH, encoding: "UTF-8"))
rescue JSON::ParserError
  {}
end

def save_geocode_cache(cache)
  File.write(CACHE_PATH, JSON.pretty_generate(cache), mode: "w", encoding: "UTF-8")
end

def geocode_queries(row, postal_code)
  queries = []
  street = row["Straße"].to_s.strip
  city = row["Ort"].to_s.strip
  state = row["Bundesland"].to_s.strip

  if !street.empty? && !postal_code.empty? && !city.empty?
    queries << {
      label: "address",
      params: {
        street: street,
        postalcode: postal_code,
        city: city,
        country: "Germany"
      }
    }
  end

  if !postal_code.empty? && !city.empty?
    queries << {
      label: "postal_city",
      params: {
        postalcode: postal_code,
        city: city,
        country: "Germany"
      }
    }
  end

  if !city.empty? && !state.empty?
    queries << {
      label: "city_state",
      params: {
        city: city,
        state: state,
        country: "Germany"
      }
    }
  end

  queries
end

def perform_geocode(query)
  qs = URI.encode_www_form(query[:params].merge(format: "jsonv2", limit: 1))
  url = "https://nominatim.openstreetmap.org/search?#{qs}"
  stdout, stderr, status = Open3.capture3(
    "curl",
    "-fsSL",
    "-H",
    "User-Agent: #{GEOCODER_USER_AGENT}",
    url
  )
  raise stderr unless status.success?

  payload = JSON.parse(stdout)
  hit = payload.first
  return nil unless hit

  {
    "lat" => hit["lat"].to_f,
    "lon" => hit["lon"].to_f,
    "source" => "geocoded_#{query[:label]}",
    "display_name" => hit["display_name"]
  }
end

def geocode_with_cache(row, postal_code, cache)
  queries = geocode_queries(row, postal_code)

  queries.each do |query|
    cache_key = query[:params].map { |key, value| "#{key}=#{value}" }.join("|")
    if cache.key?(cache_key)
      cached = cache[cache_key]
      return cached unless cached["lat"].nil? || cached["lon"].nil?
      next
    end

    result = perform_geocode(query)
    cache[cache_key] = result || { "lat" => nil, "lon" => nil, "source" => nil, "display_name" => nil }
    save_geocode_cache(cache)
    sleep 1
    return result if result
  end

  nil
end

def js_string(value)
  JSON.generate(value.to_s, ascii_only: false)
end

def build_description(row)
  parts = []
  parts << "Sektor: #{row['Sektor']}" unless row["Sektor"].to_s.empty?
  parts << "Fachrichtung: #{row['Fachrichtung']}" unless row["Fachrichtung"].to_s.empty? || row["Fachrichtung"] == "-"
  parts << "Primärsystem: #{row['Primärsystem']}" unless row["Primärsystem"].to_s.empty? || row["Primärsystem"] == "-"
  parts << row["Notiz"] unless row["Notiz"].to_s.empty?
  parts.join(" · ")
end

def write_locations(locations)
  category_order = ["Arztpraxen", "Krankenhäuser", "Apotheken", "Pflegeeinrichtungen", "Rettungsdienst"]
  locations.sort_by! { |entry| [category_order.index(entry[:category]) || 999, entry[:city], entry[:name]] }
  last_category = locations.map { |entry| entry[:category] }.reverse.find { |category| category }

  lines = []
  lines << "// Datenbasis fuer Kartenmarker."
  lines << "// Generiert aus Netzwerk_clean einer XLSX-Quelldatei."
  lines << "// Neue Eintraege koennen manuell ergaenzt oder erneut aus Excel importiert werden."
  lines << "// Pflichtfelder fuer die Karte: name, category, city, lat, lon"
  lines << ""
  lines << "window.MAP_LOCATIONS = ["

  category_order.each do |category|
    entries = locations.select { |entry| entry[:category] == category }
    next if entries.empty?

    lines << "  // #{category}"
    entries.each_with_index do |entry, index|
      is_last = category == last_category && index == entries.length - 1
      lines << "  {"
      ordered = [
        [:name, entry[:name]],
        [:category, entry[:category]],
        [:city, entry[:city]],
        [:state, entry[:state]],
        [:street, entry[:street]],
        [:postal_code, entry[:postal_code]],
        [:lat, entry[:lat]],
        [:lon, entry[:lon]],
        [:url, entry[:url]],
        [:description, entry[:description]],
        [:person_name, entry[:person_name]],
        [:person_title, entry[:person_title]],
        [:email, entry[:email]],
        [:primary_system, entry[:primary_system]],
        [:source_id, entry[:source_id]],
        [:dq_hint, entry[:dq_hint]],
        [:coordinate_source, entry[:coordinate_source]]
      ].reject { |_, value| value.nil? || value == "" }

      ordered.each_with_index do |(key, value), value_index|
        suffix = value_index == ordered.length - 1 ? "" : ","
        rendered = value.is_a?(Numeric) ? value : js_string(value)
        lines << "    #{key}: #{rendered}#{suffix}"
      end
      lines << "  }#{is_last ? '' : ','}"
    end
    lines << ""
  end

  lines << "];"
  lines << ""
  File.write(File.join(DATA_DIR, "locations.js"), lines.join("\n"), mode: "w", encoding: "UTF-8")
end

xlsx_path = ARGV[0]
abort("Usage: ruby scripts/import_xlsx_to_locations.rb <xlsx-file>") unless xlsx_path

sheet_xml = `unzip -p "#{xlsx_path}" #{XLSX_SHEET}`
abort("Konnte #{XLSX_SHEET} nicht aus #{xlsx_path} lesen.") if sheet_xml.nil? || sheet_xml.empty?

lookup = build_lookup
geocode_cache = load_geocode_cache
rows = parse_rows(sheet_xml)
missing_locations = []

locations = rows.map do |row|
  state_key = normalize_key(row["Bundesland"])

  postal_code = row["PLZ"].to_s.strip
  postal_code = postal_code.rjust(5, "0") unless postal_code.empty?
  coords = geocode_with_cache(row, postal_code, geocode_cache) || lookup[state_key]

  missing_locations << "#{row['Einrichtung']} (#{row['Ort']})" unless coords

  {
    source_id: row["ID"].to_s,
    name: row["Einrichtung"].to_s.strip,
    category: map_category(row["Sektor"]),
    city: row["Ort"].to_s.strip,
    state: row["Bundesland"].to_s.strip,
    street: row["Straße"].to_s.strip,
    postal_code: postal_code,
    lat: coords && (coords[:lat] || coords["lat"]),
    lon: coords && (coords[:lon] || coords["lon"]),
    url: row["Website"].to_s.strip,
    description: build_description(row),
    person_name: row["Ansprechpartner"].to_s.strip,
    person_title: row["Fachrichtung"].to_s.strip,
    email: row["E-Mail"].to_s.strip,
    primary_system: row["Primärsystem"].to_s.strip,
    dq_hint: row["DQ_Hinweis"].to_s.strip,
    coordinate_source: coords && (coords[:source] || coords["source"])
  }
end

write_locations(locations)

warn("Hinweis: #{missing_locations.length} Einträge ohne Koordinaten-Fallback.") unless missing_locations.empty?
missing_locations.first(10).each { |item| warn(" - #{item}") } unless missing_locations.empty?
puts("Importiert: #{locations.length} Einträge")
