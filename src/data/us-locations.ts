// Comprehensive list of US cities, states and international locations for Apollo search
// Apollo API accepts free-text locations — these are suggestions for autocomplete

export const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
  "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
  "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan",
  "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
  "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
  "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
  "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia",
  "Wisconsin", "Wyoming", "District of Columbia",
];

export const US_CITIES = [
  // Alabama
  "Birmingham, AL", "Montgomery, AL", "Huntsville, AL", "Mobile, AL", "Tuscaloosa, AL", "Hoover, AL", "Dothan, AL", "Auburn, AL", "Decatur, AL", "Madison, AL",
  // Alaska
  "Anchorage, AK", "Fairbanks, AK", "Juneau, AK",
  // Arizona
  "Phoenix, AZ", "Tucson, AZ", "Mesa, AZ", "Chandler, AZ", "Scottsdale, AZ", "Glendale, AZ", "Gilbert, AZ", "Tempe, AZ", "Peoria, AZ", "Surprise, AZ", "Yuma, AZ", "Flagstaff, AZ", "Goodyear, AZ", "Avondale, AZ", "Buckeye, AZ",
  // Arkansas
  "Little Rock, AR", "Fort Smith, AR", "Fayetteville, AR", "Springdale, AR", "Jonesboro, AR", "Rogers, AR", "Conway, AR", "North Little Rock, AR", "Bentonville, AR",
  // California
  "Los Angeles, CA", "San Diego, CA", "San Jose, CA", "San Francisco, CA", "Fresno, CA", "Sacramento, CA", "Long Beach, CA", "Oakland, CA", "Bakersfield, CA", "Anaheim, CA",
  "Santa Ana, CA", "Riverside, CA", "Stockton, CA", "Irvine, CA", "Chula Vista, CA", "Fremont, CA", "San Bernardino, CA", "Modesto, CA", "Moreno Valley, CA", "Fontana, CA",
  "Glendale, CA", "Huntington Beach, CA", "Santa Clarita, CA", "Garden Grove, CA", "Oceanside, CA", "Rancho Cucamonga, CA", "Ontario, CA", "Santa Rosa, CA", "Elk Grove, CA", "Corona, CA",
  "Lancaster, CA", "Palmdale, CA", "Salinas, CA", "Pomona, CA", "Hayward, CA", "Escondido, CA", "Sunnyvale, CA", "Torrance, CA", "Pasadena, CA", "Orange, CA",
  "Fullerton, CA", "Thousand Oaks, CA", "Roseville, CA", "Concord, CA", "Simi Valley, CA", "Santa Clara, CA", "Victorville, CA", "Vallejo, CA", "Berkeley, CA", "El Monte, CA",
  "Downey, CA", "Costa Mesa, CA", "Carlsbad, CA", "San Marcos, CA", "Murrieta, CA", "Temecula, CA", "Clovis, CA", "Menifee, CA", "Vista, CA", "Burbank, CA",
  "Palm Springs, CA", "Redwood City, CA", "Mountain View, CA", "Palo Alto, CA", "Cupertino, CA", "San Mateo, CA", "Walnut Creek, CA", "Napa, CA", "Santa Barbara, CA", "San Luis Obispo, CA",
  // Colorado
  "Denver, CO", "Colorado Springs, CO", "Aurora, CO", "Fort Collins, CO", "Lakewood, CO", "Thornton, CO", "Arvada, CO", "Westminster, CO", "Pueblo, CO", "Centennial, CO",
  "Boulder, CO", "Greeley, CO", "Longmont, CO", "Loveland, CO", "Broomfield, CO", "Castle Rock, CO", "Parker, CO", "Commerce City, CO", "Littleton, CO", "Northglenn, CO",
  // Connecticut
  "Bridgeport, CT", "New Haven, CT", "Stamford, CT", "Hartford, CT", "Waterbury, CT", "Norwalk, CT", "Danbury, CT", "New Britain, CT", "Greenwich, CT", "Bristol, CT",
  // Delaware
  "Wilmington, DE", "Dover, DE", "Newark, DE", "Middletown, DE",
  // Florida
  "Jacksonville, FL", "Miami, FL", "Tampa, FL", "Orlando, FL", "St. Petersburg, FL", "Hialeah, FL", "Tallahassee, FL", "Fort Lauderdale, FL", "Port St. Lucie, FL", "Cape Coral, FL",
  "Pembroke Pines, FL", "Hollywood, FL", "Miramar, FL", "Gainesville, FL", "Coral Springs, FL", "Clearwater, FL", "Palm Bay, FL", "Pompano Beach, FL", "West Palm Beach, FL", "Lakeland, FL",
  "Davie, FL", "Boca Raton, FL", "Sunrise, FL", "Deltona, FL", "Plantation, FL", "Palm Coast, FL", "Deerfield Beach, FL", "Boynton Beach, FL", "Lauderhill, FL", "Weston, FL",
  "Kissimmee, FL", "Sanford, FL", "Altamonte Springs, FL", "Apopka, FL", "Winter Park, FL", "Ocoee, FL", "Winter Garden, FL", "Clermont, FL", "Daytona Beach, FL", "Ocala, FL",
  "Pensacola, FL", "Sarasota, FL", "Bradenton, FL", "Naples, FL", "Fort Myers, FL", "Melbourne, FL", "Doral, FL", "Homestead, FL", "Margate, FL", "Coconut Creek, FL",
  "Tamarac, FL", "Delray Beach, FL", "Jupiter, FL", "Wellington, FL", "North Port, FL", "Port Orange, FL", "St. Cloud, FL", "Aventura, FL", "Bonita Springs, FL",
  // Georgia
  "Atlanta, GA", "Augusta, GA", "Columbus, GA", "Macon, GA", "Savannah, GA", "Athens, GA", "Sandy Springs, GA", "Roswell, GA", "Johns Creek, GA", "Albany, GA",
  "Warner Robins, GA", "Alpharetta, GA", "Marietta, GA", "Valdosta, GA", "Smyrna, GA", "Dunwoody, GA", "Brookhaven, GA", "Peachtree City, GA", "Kennesaw, GA", "Duluth, GA",
  // Hawaii
  "Honolulu, HI", "Pearl City, HI", "Hilo, HI", "Kailua, HI", "Waipahu, HI",
  // Idaho
  "Boise, ID", "Meridian, ID", "Nampa, ID", "Idaho Falls, ID", "Caldwell, ID", "Pocatello, ID", "Coeur d'Alene, ID", "Twin Falls, ID",
  // Illinois
  "Chicago, IL", "Aurora, IL", "Rockford, IL", "Joliet, IL", "Naperville, IL", "Springfield, IL", "Peoria, IL", "Elgin, IL", "Waukegan, IL", "Champaign, IL",
  "Bloomington, IL", "Decatur, IL", "Evanston, IL", "Schaumburg, IL", "Bolingbrook, IL", "Palatine, IL", "Skokie, IL", "Des Plaines, IL", "Orland Park, IL", "Tinley Park, IL",
  // Indiana
  "Indianapolis, IN", "Fort Wayne, IN", "Evansville, IN", "South Bend, IN", "Carmel, IN", "Fishers, IN", "Bloomington, IN", "Hammond, IN", "Gary, IN", "Lafayette, IN",
  "Muncie, IN", "Terre Haute, IN", "Kokomo, IN", "Noblesville, IN", "Anderson, IN", "Greenwood, IN", "Elkhart, IN", "Mishawaka, IN", "Lawrence, IN", "Jeffersonville, IN",
  // Iowa
  "Des Moines, IA", "Cedar Rapids, IA", "Davenport, IA", "Sioux City, IA", "Iowa City, IA", "Waterloo, IA", "Ames, IA", "West Des Moines, IA", "Council Bluffs, IA", "Ankeny, IA",
  // Kansas
  "Wichita, KS", "Overland Park, KS", "Kansas City, KS", "Olathe, KS", "Topeka, KS", "Lawrence, KS", "Shawnee, KS", "Manhattan, KS", "Lenexa, KS", "Salina, KS",
  // Kentucky
  "Louisville, KY", "Lexington, KY", "Bowling Green, KY", "Owensboro, KY", "Covington, KY", "Richmond, KY", "Georgetown, KY", "Florence, KY", "Hopkinsville, KY", "Nicholasville, KY",
  // Louisiana
  "New Orleans, LA", "Baton Rouge, LA", "Shreveport, LA", "Lafayette, LA", "Lake Charles, LA", "Kenner, LA", "Bossier City, LA", "Monroe, LA", "Alexandria, LA", "Houma, LA",
  // Maine
  "Portland, ME", "Lewiston, ME", "Bangor, ME", "South Portland, ME", "Auburn, ME",
  // Maryland
  "Baltimore, MD", "Frederick, MD", "Rockville, MD", "Gaithersburg, MD", "Bowie, MD", "Hagerstown, MD", "Annapolis, MD", "College Park, MD", "Salisbury, MD", "Laurel, MD",
  "Bethesda, MD", "Silver Spring, MD", "Columbia, MD", "Germantown, MD", "Ellicott City, MD",
  // Massachusetts
  "Boston, MA", "Worcester, MA", "Springfield, MA", "Lowell, MA", "Cambridge, MA", "New Bedford, MA", "Brockton, MA", "Quincy, MA", "Lynn, MA", "Fall River, MA",
  "Newton, MA", "Somerville, MA", "Lawrence, MA", "Framingham, MA", "Haverhill, MA", "Waltham, MA", "Malden, MA", "Brookline, MA", "Plymouth, MA", "Medford, MA",
  // Michigan
  "Detroit, MI", "Grand Rapids, MI", "Warren, MI", "Sterling Heights, MI", "Ann Arbor, MI", "Lansing, MI", "Flint, MI", "Dearborn, MI", "Livonia, MI", "Troy, MI",
  "Westland, MI", "Farmington Hills, MI", "Kalamazoo, MI", "Wyoming, MI", "Southfield, MI", "Rochester Hills, MI", "Taylor, MI", "Royal Oak, MI", "St. Clair Shores, MI", "Pontiac, MI",
  // Minnesota
  "Minneapolis, MN", "St. Paul, MN", "Rochester, MN", "Duluth, MN", "Bloomington, MN", "Brooklyn Park, MN", "Plymouth, MN", "Maple Grove, MN", "Woodbury, MN", "St. Cloud, MN",
  "Eagan, MN", "Eden Prairie, MN", "Minnetonka, MN", "Burnsville, MN", "Lakeville, MN", "Blaine, MN", "Coon Rapids, MN", "Edina, MN", "Apple Valley, MN", "Mankato, MN",
  // Mississippi
  "Jackson, MS", "Gulfport, MS", "Southaven, MS", "Hattiesburg, MS", "Biloxi, MS", "Meridian, MS", "Tupelo, MS", "Olive Branch, MS",
  // Missouri
  "Kansas City, MO", "St. Louis, MO", "Springfield, MO", "Columbia, MO", "Independence, MO", "Lee's Summit, MO", "O'Fallon, MO", "St. Joseph, MO", "St. Charles, MO", "St. Peters, MO",
  "Blue Springs, MO", "Florissant, MO", "Joplin, MO", "Chesterfield, MO", "Jefferson City, MO",
  // Montana
  "Billings, MT", "Missoula, MT", "Great Falls, MT", "Bozeman, MT", "Butte, MT", "Helena, MT",
  // Nebraska
  "Omaha, NE", "Lincoln, NE", "Bellevue, NE", "Grand Island, NE", "Kearney, NE", "Fremont, NE",
  // Nevada
  "Las Vegas, NV", "Henderson, NV", "Reno, NV", "North Las Vegas, NV", "Sparks, NV", "Carson City, NV",
  // New Hampshire
  "Manchester, NH", "Nashua, NH", "Concord, NH", "Derry, NH", "Dover, NH", "Rochester, NH",
  // New Jersey
  "Newark, NJ", "Jersey City, NJ", "Paterson, NJ", "Elizabeth, NJ", "Trenton, NJ", "Clifton, NJ", "Camden, NJ", "Passaic, NJ", "Edison, NJ", "Woodbridge, NJ",
  "Toms River, NJ", "Hamilton, NJ", "Bridgewater, NJ", "Cherry Hill, NJ", "Hoboken, NJ", "Princeton, NJ", "Morristown, NJ", "Parsippany, NJ", "Wayne, NJ", "Hackensack, NJ",
  // New Mexico
  "Albuquerque, NM", "Las Cruces, NM", "Rio Rancho, NM", "Santa Fe, NM", "Roswell, NM", "Farmington, NM",
  // New York
  "New York, NY", "Buffalo, NY", "Rochester, NY", "Yonkers, NY", "Syracuse, NY", "Albany, NY", "New Rochelle, NY", "Mount Vernon, NY", "Schenectady, NY", "Utica, NY",
  "White Plains, NY", "Troy, NY", "Binghamton, NY", "Ithaca, NY", "Long Beach, NY", "Saratoga Springs, NY", "Poughkeepsie, NY", "Garden City, NY", "Great Neck, NY",
  // North Carolina
  "Charlotte, NC", "Raleigh, NC", "Greensboro, NC", "Durham, NC", "Winston-Salem, NC", "Fayetteville, NC", "Cary, NC", "Wilmington, NC", "High Point, NC", "Asheville, NC",
  "Concord, NC", "Gastonia, NC", "Jacksonville, NC", "Chapel Hill, NC", "Burlington, NC", "Huntersville, NC", "Apex, NC", "Mooresville, NC", "Wake Forest, NC", "Hickory, NC",
  // North Dakota
  "Fargo, ND", "Bismarck, ND", "Grand Forks, ND", "Minot, ND", "West Fargo, ND",
  // Ohio
  "Columbus, OH", "Cleveland, OH", "Cincinnati, OH", "Toledo, OH", "Akron, OH", "Dayton, OH", "Parma, OH", "Canton, OH", "Youngstown, OH", "Lorain, OH",
  "Hamilton, OH", "Springfield, OH", "Kettering, OH", "Elyria, OH", "Lakewood, OH", "Dublin, OH", "Westerville, OH", "Cuyahoga Falls, OH", "Mentor, OH", "Beavercreek, OH",
  // Oklahoma
  "Oklahoma City, OK", "Tulsa, OK", "Norman, OK", "Broken Arrow, OK", "Edmond, OK", "Lawton, OK", "Moore, OK", "Midwest City, OK", "Stillwater, OK", "Enid, OK",
  // Oregon
  "Portland, OR", "Salem, OR", "Eugene, OR", "Gresham, OR", "Hillsboro, OR", "Beaverton, OR", "Bend, OR", "Medford, OR", "Springfield, OR", "Corvallis, OR", "Albany, OR", "Lake Oswego, OR", "Tigard, OR", "Tualatin, OR",
  // Pennsylvania
  "Philadelphia, PA", "Pittsburgh, PA", "Allentown, PA", "Reading, PA", "Scranton, PA", "Bethlehem, PA", "Lancaster, PA", "Harrisburg, PA", "Erie, PA", "York, PA",
  "Wilkes-Barre, PA", "Chester, PA", "State College, PA", "King of Prussia, PA", "Conshohocken, PA", "Bala Cynwyd, PA", "Plymouth Meeting, PA", "Wayne, PA", "Malvern, PA",
  // Rhode Island
  "Providence, RI", "Warwick, RI", "Cranston, RI", "Pawtucket, RI", "East Providence, RI", "Newport, RI",
  // South Carolina
  "Columbia, SC", "Charleston, SC", "North Charleston, SC", "Mount Pleasant, SC", "Rock Hill, SC", "Greenville, SC", "Summerville, SC", "Goose Creek, SC", "Hilton Head Island, SC", "Florence, SC",
  "Spartanburg, SC", "Myrtle Beach, SC", "Greer, SC", "Bluffton, SC",
  // South Dakota
  "Sioux Falls, SD", "Rapid City, SD", "Aberdeen, SD", "Brookings, SD",
  // Tennessee
  "Nashville, TN", "Memphis, TN", "Knoxville, TN", "Chattanooga, TN", "Clarksville, TN", "Murfreesboro, TN", "Franklin, TN", "Jackson, TN", "Johnson City, TN", "Bartlett, TN",
  "Hendersonville, TN", "Kingsport, TN", "Collierville, TN", "Smyrna, TN", "Cleveland, TN", "Brentwood, TN", "Germantown, TN", "Spring Hill, TN", "Gallatin, TN", "Lebanon, TN",
  // Texas
  "Houston, TX", "San Antonio, TX", "Dallas, TX", "Austin, TX", "Fort Worth, TX", "El Paso, TX", "Arlington, TX", "Corpus Christi, TX", "Plano, TX", "Laredo, TX",
  "Lubbock, TX", "Garland, TX", "Irving, TX", "Amarillo, TX", "Grand Prairie, TX", "Brownsville, TX", "McKinney, TX", "Frisco, TX", "Pasadena, TX", "Mesquite, TX",
  "Killeen, TX", "McAllen, TX", "Midland, TX", "Waco, TX", "Beaumont, TX", "Denton, TX", "Carrollton, TX", "Round Rock, TX", "Abilene, TX", "Pearland, TX",
  "Richardson, TX", "Odessa, TX", "College Station, TX", "Sugar Land, TX", "Lewisville, TX", "Tyler, TX", "Allen, TX", "League City, TX", "San Marcos, TX", "Edinburg, TX",
  "Temple, TX", "Flower Mound, TX", "New Braunfels, TX", "North Richland Hills, TX", "Conroe, TX", "Cedar Park, TX", "Pflugerville, TX", "Georgetown, TX", "Mansfield, TX", "Rowlett, TX",
  "The Woodlands, TX", "Katy, TX", "Cypress, TX", "Spring, TX", "Humble, TX", "Tomball, TX", "Southlake, TX", "Grapevine, TX", "Colleyville, TX", "Coppell, TX",
  // Utah
  "Salt Lake City, UT", "West Valley City, UT", "Provo, UT", "West Jordan, UT", "Orem, UT", "Sandy, UT", "Ogden, UT", "St. George, UT", "Layton, UT", "Lehi, UT",
  "South Jordan, UT", "Millcreek, UT", "Taylorsville, UT", "Logan, UT", "Murray, UT", "Draper, UT", "Bountiful, UT", "Riverton, UT", "American Fork, UT",
  // Vermont
  "Burlington, VT", "South Burlington, VT", "Rutland, VT", "Montpelier, VT",
  // Virginia
  "Virginia Beach, VA", "Norfolk, VA", "Chesapeake, VA", "Richmond, VA", "Newport News, VA", "Alexandria, VA", "Hampton, VA", "Roanoke, VA", "Portsmouth, VA", "Suffolk, VA",
  "Lynchburg, VA", "Harrisonburg, VA", "Charlottesville, VA", "Manassas, VA", "Fredericksburg, VA", "Leesburg, VA", "Ashburn, VA", "Herndon, VA", "Reston, VA", "Tysons, VA",
  "McLean, VA", "Arlington, VA", "Falls Church, VA", "Fairfax, VA", "Vienna, VA",
  // Washington
  "Seattle, WA", "Spokane, WA", "Tacoma, WA", "Vancouver, WA", "Bellevue, WA", "Kent, WA", "Everett, WA", "Renton, WA", "Spokane Valley, WA", "Federal Way, WA",
  "Kirkland, WA", "Auburn, WA", "Redmond, WA", "Olympia, WA", "Bellingham, WA", "Kennewick, WA", "Lakewood, WA", "Issaquah, WA", "Sammamish, WA", "Bothell, WA",
  // West Virginia
  "Charleston, WV", "Huntington, WV", "Morgantown, WV", "Parkersburg, WV", "Wheeling, WV",
  // Wisconsin
  "Milwaukee, WI", "Madison, WI", "Green Bay, WI", "Kenosha, WI", "Racine, WI", "Appleton, WI", "Waukesha, WI", "Oshkosh, WI", "Eau Claire, WI", "Janesville, WI",
  "West Allis, WI", "La Crosse, WI", "Sheboygan, WI", "Wauwatosa, WI", "Fond du Lac, WI", "Brookfield, WI", "New Berlin, WI",
  // Wyoming
  "Cheyenne, WY", "Casper, WY", "Laramie, WY", "Gillette, WY",
];

export const INTERNATIONAL_LOCATIONS = [
  // Countries
  "United States", "United Kingdom", "Canada", "Australia", "Germany", "France", "Brazil",
  "India", "Japan", "Mexico", "Spain", "Italy", "Netherlands", "Sweden", "Switzerland",
  "Singapore", "Ireland", "Israel", "South Korea", "Argentina", "Colombia", "Chile",
  "Portugal", "Poland", "Belgium", "Austria", "Norway", "Denmark", "Finland",
  "New Zealand", "South Africa", "United Arab Emirates", "Saudi Arabia", "Nigeria",
  "Philippines", "Thailand", "Indonesia", "Malaysia", "Vietnam", "Taiwan", "Hong Kong", "China",
  // Major international cities
  "London, UK", "Toronto, Canada", "Vancouver, Canada", "Montreal, Canada", "Ottawa, Canada", "Calgary, Canada", "Edmonton, Canada",
  "Sydney, Australia", "Melbourne, Australia", "Brisbane, Australia", "Perth, Australia", "Adelaide, Australia",
  "Berlin, Germany", "Munich, Germany", "Hamburg, Germany", "Frankfurt, Germany", "Cologne, Germany", "Stuttgart, Germany", "Düsseldorf, Germany",
  "Paris, France", "Lyon, France", "Marseille, France", "Toulouse, France", "Nice, France",
  "Amsterdam, Netherlands", "Rotterdam, Netherlands", "The Hague, Netherlands", "Utrecht, Netherlands",
  "Dublin, Ireland", "Cork, Ireland",
  "Tel Aviv, Israel", "Jerusalem, Israel", "Haifa, Israel",
  "Singapore",
  "Tokyo, Japan", "Osaka, Japan", "Yokohama, Japan", "Nagoya, Japan", "Fukuoka, Japan",
  "São Paulo, Brazil", "Rio de Janeiro, Brazil", "Brasília, Brazil", "Belo Horizonte, Brazil", "Curitiba, Brazil",
  "Mexico City, Mexico", "Guadalajara, Mexico", "Monterrey, Mexico", "Puebla, Mexico",
  "Madrid, Spain", "Barcelona, Spain", "Valencia, Spain", "Seville, Spain",
  "Milan, Italy", "Rome, Italy", "Turin, Italy", "Florence, Italy",
  "Stockholm, Sweden", "Gothenburg, Sweden", "Malmö, Sweden",
  "Zurich, Switzerland", "Geneva, Switzerland", "Basel, Switzerland", "Bern, Switzerland",
  "Dubai, UAE", "Abu Dhabi, UAE",
  "Bangalore, India", "Mumbai, India", "Delhi, India", "Hyderabad, India", "Pune, India", "Chennai, India",
  "Seoul, South Korea", "Busan, South Korea",
  "Buenos Aires, Argentina", "Córdoba, Argentina", "Rosario, Argentina",
  "Bogota, Colombia", "Medellín, Colombia", "Cali, Colombia",
  "Santiago, Chile", "Valparaíso, Chile",
  "Lagos, Nigeria", "Abuja, Nigeria",
  "Cape Town, South Africa", "Johannesburg, South Africa", "Durban, South Africa",
  "Warsaw, Poland", "Kraków, Poland", "Wrocław, Poland",
  "Copenhagen, Denmark", "Aarhus, Denmark",
  "Helsinki, Finland", "Tampere, Finland",
  "Oslo, Norway", "Bergen, Norway",
  "Lisbon, Portugal", "Porto, Portugal",
  "Brussels, Belgium", "Antwerp, Belgium",
  "Vienna, Austria", "Graz, Austria",
  "Auckland, New Zealand", "Wellington, New Zealand", "Christchurch, New Zealand",
  "Manila, Philippines", "Cebu, Philippines",
  "Bangkok, Thailand",
  "Jakarta, Indonesia",
  "Kuala Lumpur, Malaysia",
  "Ho Chi Minh City, Vietnam", "Hanoi, Vietnam",
  "Taipei, Taiwan",
  "Hong Kong",
  "Shanghai, China", "Beijing, China", "Shenzhen, China", "Guangzhou, China", "Hangzhou, China",
];

export const ALL_LOCATIONS = [...US_CITIES, ...US_STATES, ...INTERNATIONAL_LOCATIONS];
