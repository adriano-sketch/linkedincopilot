import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Top ~300 US cities + major international cities for lead sourcing
const LOCATIONS: string[] = [
  // US - by state (major metros)
  "Birmingham, AL","Huntsville, AL","Montgomery, AL","Anchorage, AK","Phoenix, AZ","Scottsdale, AZ","Tucson, AZ","Mesa, AZ",
  "Little Rock, AR","Los Angeles, CA","San Francisco, CA","San Diego, CA","San Jose, CA","Sacramento, CA","Irvine, CA","Palo Alto, CA","Oakland, CA","Fresno, CA","Long Beach, CA","Santa Monica, CA","Pasadena, CA",
  "Denver, CO","Colorado Springs, CO","Boulder, CO","Aurora, CO",
  "Hartford, CT","Stamford, CT","New Haven, CT","Bridgeport, CT",
  "Wilmington, DE",
  "Washington, DC",
  "Miami, FL","Orlando, FL","Tampa, FL","Jacksonville, FL","Fort Lauderdale, FL","St. Petersburg, FL","Naples, FL","Boca Raton, FL","Sarasota, FL","West Palm Beach, FL","Kissimmee, FL","Winter Garden, FL","Lakeland, FL","Altamonte Springs, FL",
  "Atlanta, GA","Savannah, GA","Augusta, GA",
  "Honolulu, HI",
  "Boise, ID",
  "Chicago, IL","Naperville, IL","Aurora, IL","Evanston, IL","Schaumburg, IL",
  "Indianapolis, IN","Fort Wayne, IN",
  "Des Moines, IA","Cedar Rapids, IA",
  "Wichita, KS","Overland Park, KS",
  "Louisville, KY","Lexington, KY",
  "New Orleans, LA","Baton Rouge, LA",
  "Portland, ME",
  "Baltimore, MD","Bethesda, MD","Rockville, MD",
  "Boston, MA","Cambridge, MA","Worcester, MA",
  "Detroit, MI","Grand Rapids, MI","Ann Arbor, MI","Troy, MI",
  "Minneapolis, MN","St. Paul, MN","Bloomington, MN",
  "Jackson, MS",
  "Kansas City, MO","St. Louis, MO","Springfield, MO",
  "Billings, MT",
  "Omaha, NE","Lincoln, NE",
  "Las Vegas, NV","Reno, NV",
  "Manchester, NH",
  "Newark, NJ","Jersey City, NJ","Princeton, NJ","Hoboken, NJ","Morristown, NJ",
  "Albuquerque, NM","Santa Fe, NM",
  "New York, NY","Manhattan, NY","Brooklyn, NY","Queens, NY","Buffalo, NY","Rochester, NY","Albany, NY","White Plains, NY",
  "Charlotte, NC","Raleigh, NC","Durham, NC","Greensboro, NC","Wilmington, NC",
  "Fargo, ND",
  "Columbus, OH","Cleveland, OH","Cincinnati, OH","Akron, OH","Dayton, OH",
  "Oklahoma City, OK","Tulsa, OK",
  "Portland, OR","Eugene, OR","Salem, OR",
  "Philadelphia, PA","Pittsburgh, PA","Harrisburg, PA","Allentown, PA","King of Prussia, PA",
  "Providence, RI",
  "Charleston, SC","Columbia, SC","Greenville, SC",
  "Sioux Falls, SD",
  "Nashville, TN","Memphis, TN","Knoxville, TN","Chattanooga, TN",
  "Houston, TX","Dallas, TX","Austin, TX","San Antonio, TX","Fort Worth, TX","Plano, TX","Irving, TX","Frisco, TX","Arlington, TX","El Paso, TX",
  "Salt Lake City, UT","Provo, UT",
  "Burlington, VT",
  "Richmond, VA","Virginia Beach, VA","Arlington, VA","McLean, VA","Tysons, VA","Alexandria, VA","Reston, VA",
  "Seattle, WA","Bellevue, WA","Tacoma, WA","Redmond, WA","Spokane, WA",
  "Charleston, WV",
  "Milwaukee, WI","Madison, WI",
  "Cheyenne, WY",
  // International
  "Toronto, Canada","Vancouver, Canada","Montreal, Canada","Calgary, Canada","Ottawa, Canada",
  "London, United Kingdom","Manchester, United Kingdom","Birmingham, United Kingdom","Edinburgh, United Kingdom",
  "Sydney, Australia","Melbourne, Australia","Brisbane, Australia","Perth, Australia",
  "Berlin, Germany","Munich, Germany","Frankfurt, Germany","Hamburg, Germany",
  "Paris, France","Lyon, France","Marseille, France",
  "Amsterdam, Netherlands","Rotterdam, Netherlands",
  "Dublin, Ireland",
  "Zurich, Switzerland","Geneva, Switzerland",
  "Stockholm, Sweden","Gothenburg, Sweden",
  "Oslo, Norway",
  "Copenhagen, Denmark",
  "Helsinki, Finland",
  "Singapore, Singapore",
  "Hong Kong, China","Shanghai, China","Beijing, China","Shenzhen, China",
  "Tokyo, Japan","Osaka, Japan",
  "Seoul, South Korea",
  "Mumbai, India","Bangalore, India","Delhi, India","Hyderabad, India","Pune, India",
  "São Paulo, Brazil","Rio de Janeiro, Brazil",
  "Mexico City, Mexico","Monterrey, Mexico","Guadalajara, Mexico",
  "Dubai, UAE","Abu Dhabi, UAE",
  "Tel Aviv, Israel","Jerusalem, Israel",
  "Lisbon, Portugal","Porto, Portugal",
  "Madrid, Spain","Barcelona, Spain",
  "Milan, Italy","Rome, Italy",
  "Warsaw, Poland","Krakow, Poland",
  "Prague, Czech Republic",
  "Vienna, Austria",
  "Brussels, Belgium",
  "Cape Town, South Africa","Johannesburg, South Africa",
  "Lagos, Nigeria","Nairobi, Kenya",
  "Buenos Aires, Argentina","Santiago, Chile","Bogota, Colombia","Lima, Peru",
  "Bangkok, Thailand","Jakarta, Indonesia","Kuala Lumpur, Malaysia","Manila, Philippines","Ho Chi Minh City, Vietnam",
];

// Pre-compute lowercase for matching
const LOCATIONS_LOWER = LOCATIONS.map(l => l.toLowerCase());

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { query } = await req.json();
    const trimmed = (query || "").trim().toLowerCase();

    if (trimmed.length < 2) {
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const suggestions: string[] = [];
    for (let i = 0; i < LOCATIONS_LOWER.length && suggestions.length < 10; i++) {
      if (LOCATIONS_LOWER[i].includes(trimmed)) {
        suggestions.push(LOCATIONS[i]);
      }
    }

    return new Response(JSON.stringify({ suggestions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("location-typeahead error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error", suggestions: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
