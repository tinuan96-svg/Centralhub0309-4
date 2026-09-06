import * as fs from 'fs';
import { randomUUID } from "node:crypto";

const rawData = `Brand	Product Name	slug	category	price	cost_price	stock_quantity	weight	Unit	is_featured	Active 	warehouse_location	expiry_date
Double Horse	Roasted Vermicelli 	double-horse-roasted-vermicelli-standard-size	Desserts	4.29	3	11		g	FALSE	TRUE
Melam	Easy upma mix 	melam-easy-upma-mix-standard-size	Ready to Eat	3.59	0	10		g	FALSE	TRUE		30/08/2027
Double Horse	Tamarind (kudampuli)	double-horse-tamarind-standard-size	Seasonings & Condiments	1.79	1.2	20		g	FALSE	TRUE		01/08/2026
Peruma	Palakkadan Matta rice 	peruma-palakkadan-matta-rice	Rices	15.99	8.99	150		g	TRUE	FALSE
Nirapara	Coconut Oil	Coconut Oil Nirapara	Oils & Fats	7.24	4.99	29	1	l	FALSE	TRUE	COCO15
Nirapara	Tender Mango Pickle	Tender Mango Pickle Nirapara	Pickles & Preserves	2.99	2.09	12	400	g	FALSE	TRUE	TEND01
Nirapara	Kadu Mango Pickle	Kadu Mango Pickle Nirapara	Pickles & Preserves	2.16	1.19	10	400	g	FALSE	TRUE	KADU01
Nirapara	Cut Mango Pickle	Cut Mango Pickle Nirapara	Pickles & Preserves	2.16	1.49	23	400	g	FALSE	TRUE	CUTM01
Nirapara	Kashmiri Chilli Powder	Kashmiri Chilli Powder Nirapara	Curry Masalas	7.24	4.49	12	400	g	FALSE	TRUE	KASH07
Nirapara	Sambar Powder	Sambar Powder Nirapara	Curry Masalas	2.16	1.49	24	160	g	TRUE	TRUE	SAMB01
Nirapara	Meat Masala	Meat Masala Nirapara	Curry Masalas	2.16	1.49	18	160	g	FALSE	TRUE	MEAT01
Nirapara	Chicken Masala	Chicken Masala Nirapara	Curry Masalas	2.16	1.49	24	160	g	FALSE	TRUE	CHIC01
Nirapara	Rice Powder	Rice Powder Nirapara	Flour & Grains	2.6	1.79	20	1	kg	FALSE	TRUE	RICE01
Nirapara	Appam  Idiappam Podi	Appam / Idiappam Podi Nirapara	Flour & Grains	2.6	1.79	40	1	kg	FALSE	TRUE	APPA01
Nirapara	Puttu Podi White	puttu-podi-white-Nirapara	Flour & Grains	2.69	1.79	40	1	Kg	FALSE	TRUE	PUTT01
Green Valley	Coconut Oil	coconut-oil-GV	Oils & Fats	6.99	4.99	21	1	Kg	FALSE	TRUE	COCO05
Tasty Nibbles	Tender Mango Pickle	tender-mango-pickle-tastynibbles	Pickles & Preserves	3.99	2.99	12	400	g	FALSE	TRUE	TEND08
Double Horse	Coriander Powder	coriander-powder-double Horse	Curry Masalas	2.59	1.79	17	200	G	FALSE	TRUE	CORI07
Eastern	Sambar Powder	sambar-powder-eastern	Curry Masalas	2.45	1.69	24	160	G	FALSE	TRUE	SAMB02
Eastern	Chicken Masala	chicken-masala-Eastern	Curry Masalas	2.45	1.69	17	100	G	TRUE	TRUE	CHIC02
Peruma	Matta Rice Long Grain 	matta-rice-long-grain-Peruma	Rices	15.99	8.99	145	10	kg	TRUE	TRUE	MS-000150
Tasty Nibbles	Roasted Coconut Paste	roasted-coconut-paste	Pickles & Preserves	3.61	2.49	48	200	g	FALSE	TRUE	MS-000149
Nirapara	Garlic Pickle	garlic-pickle	Pickles & Preserves	2.89	1.99	10	400	g	FALSE	TRUE	MS-000148
Nirapara	Hot Lime Pickle	hot-lime-pickle	Pickles & Preserves	2.16	1.49	23	400	g	FALSE	TRUE	MS-000147
Nirapara	Rasam Powder	rasam-powder	Curry Masalas	2.16	1.49	12	160	g	FALSE	TRUE	MS-000146
Nirapara	Fish Fry Masala	fish-fry-masala	Curry Masalas	1.44	0.99	12	100	g	TRUE	TRUE	MS-000145
Nirapara	Fish Masala Powder	fish-masala-powder	Curry Masalas	2.16	1.49	11	160	g	FALSE	TRUE	MS-000144
Village Farmer	Idli Rice	idli-rice	Rices	8.89	6.99	4	5	kg	FALSE	TRUE	MS-000143
Nirapara	Chemba Puttu Podi	chemba-puttu-podi	Flour & Grains	2.74	1.89	20	1	kg	FALSE	TRUE	MS-000142
Nirapara	Pathiri Podi	pathiri-podi	Flour & Grains	2.6	1.79	19	1	kg	FALSE	TRUE	MS-000141
Nirapara	Dosa Podi	dosa-podi	Flour & Grains	3.61	2.49	20	1	kg	TRUE	TRUE	MS-000140
Tasty Nibbles	Lime Pickle	lime-pickle	Pickles & Preserves	2.75	1.49	36	400	g	FALSE	TRUE	MS-000138	30/11/2027
Tasty Nibbles	Kadu Mango Pickle	kadu-mango-pickle	Pickles & Preserves	2.16	1.49	12	400	g	FALSE	TRUE	MS-000137
Tasty Nibbles	Kadu Mango Pickle	Kadu-mango-pickle	Pickles & Preserves	2.16	1.49	24	400	g	FALSE	TRUE	MS-000136
Eastern	Kashmiri Chilli Powder	kashmiri-chilli-powder	Curry Masalas	0.25	0.17	600	400	g	FALSE	FALSE	MS-000135
Eastern	Kashmiri Chilli Powder	chilli-powder	Curry Masalas	4.34	2.99	22	500	g	FALSE	TRUE	MS-000134
Double Horse	Rasam Masala	rasam-masala	Curry Masalas	2.16	1.49	10	140	g	FALSE	TRUE	MS-000133
Eastern	Fish Masala	fish-masala	Curry Masalas	2.45	1.69	11	165	g	FALSE	TRUE	MS-000132
Eastern	Meat Masala	meat-masala	Curry Masalas	2.45	1.69	18	160	g	FALSE	TRUE	MS-000131
Tasty Nibbles	Appam  Idiappam Podi	appam-idiappam-podi	Flour & Grains	2.45	1.69	36	1	kg	FALSE	TRUE	MS-000129
Tasty Nibbles	Rice Powder White	rice-powder-white	Flour & Grains	2.45	1.69	24	1	kg	FALSE	TRUE	MS-000128
Tasty Nibbles	Puttu Podi White	puttu-podi-white	Flour & Grains	2.45	1.69	36	1	kg	FALSE	TRUE	MS-000127
Parachute	Coconut Oil	coconut-oil	Oils & Fats	2.25	1.19	10	200	ml	FALSE	TRUE	MS-000126
Nescafe	Original Instant Coffee	nescafe-original-instant-coffee	Tea & Coffee	2.35	1.97	10	1	pcs	FALSE	TRUE	MS-000125	30/09/2027
Chakra	Phool Makhana	phool-makhana	Snacks & Sweets	3.49	2.1	29	100	G	FALSE	TRUE	MS-000124	30/03/2027
Chakra	Cinnamon Powder	cinnamon-powder	Whole & Ground Spices	3.99	2.47	24	200	G	FALSE	TRUE	MS-000123	28/08/2026
Chakra	Pepper Powder	pepper-powder	Whole & Ground Spices	4.99	3.23	60	200	G	FALSE	TRUE	MS-000122	28/08/2026
Double Horse	Rice palada	rice-ada	Desserts	1.99	1.2	13	200	G	FALSE	TRUE	MS-000121	28/12/2026
Double Horse	Roasted Vermicelli	roasted-vermicelli	Desserts	2.59	1.7	27	1	Kg	FALSE	TRUE	MS-000120	15/11/2026
Bono	Croissant Chocolate	croissant-chocolate	Snacks & Sweets	0.99	0.5	18	80	G	FALSE	TRUE	MS-000119
Bono	Croissant Pistachio	croissant-pistachio	Snacks & Sweets	0.99	0.5	15	80	G	FALSE	TRUE	MS-000118
Hot Cake	Plum Cake	plum-cake	Snacks & Sweets	1.99	0	14	800	G	FALSE	TRUE	MS-000117
Tameemi	Rice Powder	rice-powder	Flour & Grains	2.99	1.51	12	1	Kg	FALSE	TRUE	MS-000116
Laila	Golden Sella Basmati	golden-sella-basmati	Rices	19.99	15.79	0	10	Kg	FALSE	FALSE	MS-000115
Double Horse	Surekha Rice	surekha-rice	Rices	7.99	5.5	0	5	kg	FALSE	TRUE	MS-000114
Kohinoor	Platinum Basmati Blue	platinum-basmati-blue	Rices	13.49	8.99	1	5	kg	FALSE	TRUE	MS-000113
Double Horse	Short Grain Matta Rice	long-grain-matta-rice-10kg	Rices	14.99	11	14	10	Kg	FALSE	TRUE	MS-000112
Double Horse	Short Grain Matta Rice	short-grain-matta-rice-5kg	Rices	7.99	5.5	16	5	kg	FALSE	TRUE	MS-000111
STF	Ginger Garlic Paste	ginger-garlic-paste	Seasonings & Condiments	2.79	1.6	23	300	G	FALSE	TRUE	MS-000110
STF	Tamarind Paste	tamarind-paste	Seasonings & Condiments	2.49	1.4	24	300	G	FALSE	TRUE	MS-000109
STF	Mango Ginger Pickle	mango-ginger-pickle	Pickles & Preserves	2.99	0	10	400	G	FALSE	TRUE	MS-000108
Double Horse	Tender Mango Pickle	tender-mango-pickle	Pickles & Preserves	2.99	0	6	400	g	FALSE	TRUE	MS-000107
Double Horse	Kaduku Mango Pickle	kaduku-mango-pickle	Pickles & Preserves	2.99	1.9	34	400	G	FALSE	TRUE	MS-000106
Royal	Refuse Sacks	refuse-sacks	Household & Cleaning	2.45	0.77	18	30	Pcs	FALSE	TRUE	MS-000105
Always	Secure Night Wings	secure-night-wings	Health & Personal Care	2.99	2	4	1	Pcs	FALSE	TRUE	MS-000104
Himalaya	Brightening Face Scrub	brightening-face-scrub	Health & Personal Care	4.99	2.67	6	150	G	FALSE	TRUE	MS-000103
Vaseline	Aloe Vera Lip Therapy	aloe-vera-lip-therapy	Health & Personal Care	2.49	0.79	9	20	G	TRUE	TRUE	MS-000102
Colgate	Cavity Protection	cavity-protection-100ml	Health & Personal Care	1.99	0.67	3	100	G	FALSE	TRUE	MS-000101
Colgate	Cavity Protection	cavity-protection-75ml	Health & Personal Care	1.49	0.93	6	75	G	FALSE	TRUE	MS-000100
Pears	Oil Clear Soap	oil-clear-soap	Health & Personal Care	1.49	0.75	8	1	Pcs	FALSE	TRUE	MS-000099
Medimix	Ayurvedic Soap	ayurvedic-soap	Health & Personal Care	1.49	1.15	2	125	G	FALSE	TRUE	MS-000098
Lux	Bright Impress Soap	bright-impress-soap	Health & Personal Care	1.49	0.65	12	3	pcs	FALSE	TRUE	MS-000097
Lux	Velvet Touch Soap	velvet-touch-soap	Health & Personal Care	1.49	0.65	5	3	Pcs	FALSE	TRUE	MS-000096
Ariel	Original Powder	original-powder	Household & Cleaning	3.99	2.33	6	715	G	FALSE	TRUE	MS-000095
Dove	Beauty Cream Bar	beauty-cream-bar	Health & Personal Care	3.99	2.21	12	360	G	FALSE	TRUE	MS-000094
Always	Ultra Day	ultra-day	Health & Personal Care	2.99	2	4	3	Pcs	FALSE	TRUE	MS-000093
Colgate	Toothbrush	toothbrush	Health & Personal Care	1.49	0.97	3	1	Pcs	FALSE	TRUE	MS-000092
Bold	Lavender & Camomile Liquid	lavender-camomile-liquid	Household & Cleaning	4.99	3	7	744	ML	FALSE	TRUE	MS-000091
Pears	Original Soap	original-soap	Health & Personal Care	1.49	0.75	10	40	G	FALSE	TRUE	MS-000090
Medimix	Glycerine Soap	glycerine-soap	Health & Personal Care	1.49	1.12	3	125	G	FALSE	TRUE	MS-000089
Himalaya	Almond Soap	almond-soap	Health & Personal Care	1.49	0.65	5	75	G	FALSE	TRUE	MS-000088
Lux	Pink Soft Touch Soap	pink-soft-touch-soap	Health & Personal Care	1.49	0.65	10	80	G	FALSE	TRUE	MS-000087
Double Horse	Appam Idiyappam Pathiri	appam-idiyappam-pathiri	Flour & Grains	3.49	2.1	0	1	Kg	FALSE	TRUE	MS-000086
Top Op	Honey Powder	honey-powder	Seasonings & Condiments	2.99	0.6	3	1	Kg	FALSE	TRUE	MS-000085
Rajah	Whole Black Pepper	whole-black-pepper	Whole & Ground Spices	2.49	1.95	9	100	G	FALSE	TRUE	MS-000084
Rajah	Whole Black Mustard	whole-black-mustard	Whole & Ground Spices	1.99	0.64	5	100	G	FALSE	TRUE	MS-000083
Tilda	Basmati Rice	basmati-rice-2kg	Rices	6.99	4.85	4	2	Kg	FALSE	TRUE	MS-000082
Shan	Chicken Masala	chicken-masala	Curry Masalas	1.99	0.85	12	80	G	FALSE	TRUE	MS-000081
Rajah	Garam Masala	garam-masala-400g	Curry Masalas	4.99	3.14	19	400	G	FALSE	TRUE	MS-000080
Rajah	Garam Masala	garam-masala-85g	Curry Masalas	1.49	0.94	1	85	G	FALSE	TRUE	MS-000079
Oreo	Original Cookies	original-cookies	Snacks & Sweets	1.49	0	15		1	FALSE	FALSE	MS-000078
Britannia	Butter Cookies	butter-cookies	Snacks & Sweets	1.49	0	16	1	Kg	FALSE	TRUE	MS-000077
Britannia	Cashew Cookies	cashew-cookies	Snacks & Sweets	1.49	0	11	1	Kg	FALSE	TRUE	MS-000076
Kit Kat	4 Finger	4-finger	Snacks & Sweets	0.89	0.52	23	41.5	G	FALSE	TRUE	MS-000075
Pringles	Cheese & Onion	cheese-onion	Snacks & Sweets	2.99	1.67	6	165	G	FALSE	TRUE	MS-000074
Tetley	Green Tea	green-tea	Tea & Coffee	2.99	1.57	0	1	Kg	FALSE	TRUE	MS-000073
Sunfeast	Choco Fills	choco-fills	Snacks & Sweets	0.75	0.5	0	1	Kg	FALSE	TRUE	MS-000072
Aachi	Sambar Powder	sambar-powder	Curry Masalas	2.49	1	10	100	G	FALSE	TRUE	MS-000071
Double Horse	Biryani Masala	biryani-masala	Curry Masalas	2.49	1	11	150	G	FALSE	TRUE	MS-000070
Brook Bond	Red Label Tea	red-label-tea	Tea & Coffee	5.49	3.39	1	450	G	FALSE	TRUE	MS-000069
Aachi	Mutton Curry Masala	mutton-curry-masala	Curry Masalas	2.49	1	9	100	G	FALSE	TRUE	MS-000068
Brook Bond	Elaichi Tea	elaichi-tea	Tea & Coffee	3.49	0	0	1	Kg	FALSE	FALSE	MS-000067
PG Tips	Tea 50 Bags	tea-50-bags	Tea & Coffee	3.49	0	8	50	Pcs	FALSE	TRUE	MS-000066
PG Tips	Tea 40 Bags	tea-40-bags	Tea & Coffee	2.99	0	12	40	Pcs	FALSE	TRUE	MS-000065
STF	Garlic Murukku	garlic-murukku	Snacks & Sweets	1.99	0	39	1	Kg	FALSE	TRUE	MS-000064
Yippee	Magic Masala Noodles	magic-masala-noodles	Ready to Eat	1.99	1.16	16	280	G	FALSE	TRUE	MS-000063
Natco	Gram Flour	gram-flour	Flour & Grains	1.99	0.96	5	500	G	FALSE	TRUE	MS-000062
Cadbury	Bournvita	bournvita	Tea & Coffee	4.99	4.58	11	1	Kg	FALSE	TRUE	MS-000061
Lifebuoy	Care Soap	care-soap	Health & Personal Care	1.49	0.75	13	130	G	FALSE	TRUE	MS-000060
Dettol	Bar Soap	bar-soap	Health & Personal Care	1.99	0.95	12	2	Pcs	FALSE	TRUE	MS-000059
Cycle	Agarbathi 3 In 1	agarbathi-3-in-1	Household & Cleaning	1.99	0	17	1	Pcs	FALSE	TRUE	MS-000058
Ariel	3 In 1 Pods	3-in-1-pods	Household & Cleaning	5.99	3.22	4	12	Pods	FALSE	TRUE	MS-000057
Bold	Lavender Pods	lavender-pods	Household & Cleaning	5.99	3.22	4	12	Pods	FALSE	TRUE	MS-000056
Comfort	Fabric Conditioner	fabric-conditioner	Household & Cleaning	4.99	0	3	1350	ML	FALSE	TRUE	MS-000055
Himalaya	Dark Spot Face Wash	dark-spot-face-wash	Health & Personal Care	4.99	3.17	6	150	G	FALSE	TRUE	MS-000054
Chakra	Round Chillies	round-chillies	Whole & Ground Spices	2.49	1.35	23	100	G	FALSE	TRUE	MS-000053
Tilda	Basmati Rice	basmati-rice	Rices	24.99	18.99	1	10	Kg	FALSE	TRUE	MS-000052
Tygle	Granulated Sugar	granulated-sugar	Seasonings & Condiments	1.79	0	4		1	FALSE	FALSE	MS-000051
KTC	Sunflower Oil	sunflower-oil	Oils & Fats	10.99	7.33	3	5	l	FALSE	TRUE	MS-000050
Chakra	Sago Vadam White	sago-vadam-white	Fryums	1.99	0.9	24	200	G	FALSE	TRUE	MS-000049
Melam	Appam idiyappam podi	appam-mix	Flour & Grains	2.99	0	8	1	kg	FALSE	TRUE	MS-000048
Aachi	Chicken 65 Masala	chicken-65-masala	Curry Masalas	2.49	1.54	10	100	G	FALSE	TRUE	MS-000047
Aachi	Chilli Chicken Masala	chilli-chicken-masala	Curry Masalas	2.49	1	10	100	G	FALSE	TRUE	MS-000046
Yaffa	Safawi Dates	Safawi Dates	Snacks & Sweets	4.99	2.3	2	450	g	FALSE	TRUE	MS-000045
Double Horse	Jaggery Powder	jaggery-powder	Seasonings & Condiments	2.99	1.1	10	1	Kg	FALSE	TRUE	MS-000044
STF	Sesame Oil	sesame-oil	Oils & Fats	7.99	5.2	10	1	Ltr	FALSE	TRUE	MS-000043
Chakra	Roasted Gram Chutney Dal	roasted-gram-chutney-dal	Pulses & Beans	2.49	1.13	24	500	G	FALSE	TRUE	MS-000042
Tasty Nibbles	Wheat Payasam Mix	wheat-payasam-mix	Desserts	2.49	0	20	1	Kg	FALSE	TRUE	MS-000041
Double Horse	Rice Palada Payasam Mix	rice-palada-payasam-mix	Desserts	2.29	1.35	14	300	G	FALSE	TRUE	MS-000040
Kelloggs	Special K Original	special-k-original	Tea & Coffee	3.99	2.83	6	440	G	FALSE	TRUE	MS-000039
Haldirams	Namkeen Bhel Puri	namkeen-bhel-puri	Snacks & Sweets	1.49	0.73	10	200	G	FALSE	TRUE	MS-000038
Chakra	Mustard Seeds	mustard-seeds	Whole & Ground Spices	2.49	0.81	8	200	G	FALSE	TRUE	MS-000037
Jaimin	Tutti Frutti Rusk	tutti-frutti-rusk	Snacks & Sweets	1.99	0.9	1	1	Kg	FALSE	TRUE	MS-000036
Lipton	Lemon & Ginger Tea	lemon-ginger-tea	Tea & Coffee	2.49	1.35	2	20	Bags	FALSE	TRUE	MS-000035
Lipton	Mint Smooth Tea	mint-smooth-tea	Tea & Coffee	2.49	1.35	4	20	Bags	FALSE	TRUE	MS-000034
TRS	Garlic & Ginger Paste	garlic-ginger-paste	Seasonings & Condiments	2.49	1.13	6	300	G	FALSE	TRUE	MS-000033
Saxa	Table Salt	table-salt	Seasonings & Condiments	1.99	1.17	11	675	G	FALSE	TRUE	MS-000032
Double Horse	Soya Chunks Nano	soya-chunks-nano	Pulses & Beans	2.99	0	13	500	G	FALSE	TRUE	MS-000031
Top Op	Elaichi Green	elaichi-green	Tea & Coffee	4.99	2.42	17	50	G	FALSE	FALSE	MS-000030
Cadbury	Eclairs	eclairs	Snacks & Sweets	1.35	0.75	12	130	G	FALSE	TRUE	MS-000029
Maggi	Coconut Milk Powder	coconut-milk-powder	Seasonings & Condiments	3.49	5.5	1	300	G	FALSE	TRUE	MS-000028
Kelloggs	Coco Pops	coco-pops	Tea & Coffee	3.99	3	6	420	G	FALSE	TRUE	MS-000027
Jaimin	Elaichi Shakkarpara	elaichi-shakkarpara	Snacks & Sweets	1.29	0.75	5	200	G	FALSE	TRUE	MS-000026
Pringles	Original	original	Snacks & Sweets	2.99	1.67	6	165	G	FALSE	TRUE	MS-000025
Maggi	Hot Cup Chicken Noodles	hot-cup-chicken-noodles	Ready to Eat	1.49	0.62	7	59.2	G	FALSE	TRUE	MS-000024
Jaimin	Murukku	murukku	Snacks & Sweets	1.29	0.75	6	200	G	FALSE	TRUE	MS-000023
Jaimin	Softy Chakli	softy-chakli	Snacks & Sweets	1.29	0.75	5	200	G	FALSE	TRUE	MS-000022
Jaimin	Sweet Para	sweet-para	Snacks & Sweets	1.29	0.75	6	200	G	FALSE	TRUE	MS-000021
Nutella	Hazelnut Chocolate Spread	hazelnut-chocolate-spread	Snacks & Sweets	3.99	2.83	6	350	G	FALSE	TRUE	MS-000020
Rowse	Original Honey	original-honey	Seasonings & Condiments	2.99	1.95	4	340	G	FALSE	TRUE	MS-000019
Chakra	Jathipathri (mace)	jathipathri	Whole & Ground Spices	2.99	2.19	18	1	Kg	FALSE	TRUE	MS-000018
Chakra	Fenugreek Powder	fenugreek-powder	Whole & Ground Spices	2.49	0	8	200	G	FALSE	TRUE	MS-000017
Kelloggs	Bran Flakes	bran-flakes	Tea & Coffee	3.99	2.83	5	500	G	FALSE	TRUE	MS-000016
TRS	Moong Whole	moong-whole	Pulses & Beans	1.99	1.17	2	500	Kg	FALSE	TRUE	MS-000015
Filippo Berio	Extra Virgin Olive Oil	extra-virgin-olive-oil	Oils & Fats	3.49	2	5	250	ML	FALSE	TRUE	MS-000014
Aashirvaad	Multigrains Atta	multigrains-atta	Flour & Grains	5.85	4	2	2	Kg	FALSE	TRUE	MS-000013
Double Horse	Tamarind	tamarind	Seasonings & Condiments	3.99	2.5	21	500	g	FALSE	TRUE	MS-000012	01/08/2026
STF	Jaggery Cubes	jaggery-cubes	Seasonings & Condiments	4.99	2.99	14	1	Kg	FALSE	TRUE	MS-000011
Chakra	Coriander Powder	coriander-powder	Whole & Ground Spices	2.49	0	8	200	G	FALSE	TRUE	MS-000010
Chakra	Horse Gram	horse-gram	Pulses & Beans	2.99	0	14	1	Kg	FALSE	TRUE	MS-000009
Sunfeast	Choco Nut Fills Biscuits	choco-nut-fills-biscuits-75g-by-sunfeast-dark-fantacy	Snacks & Sweets	0.75	0.5	9	75	g	FALSE	TRUE	MS-000008	31/01/2027
Sunfeast	Choco Meltz Fills Biscuits	choco-meltz-fills-biscuits-75g-by-sunfeast-dark-fantacy	Snacks & Sweets	0.79	0.5	4	75	g	FALSE	TRUE	MS-000007	30/09/2026
Himalaya	Nourishing Skin Cream	nourishing-skin-cream-150ml-by-himalaya	Health & Personal Care	2.95	2.43	5	150	ml	FALSE	TRUE	MS-000006
Haldirams	Sweet Soan Papdi	sweet-soan-papdi-250g-by-haldirams	Snacks & Sweets	1.19	0	0	250	g	FALSE	TRUE	MS-000005
Haldirams	Sweet Peda	sweet-peda-300g-by-haldirams	Snacks & Sweets	6.99	3.59	0	300	g	FALSE	TRUE	MS-000004
Aachi	Idly chilli podi	idly-chilli-podi-100g-by-aachi	Ready to Eat	1.29	1	6	100	g	FALSE	TRUE	MS-000003	30/06/2027
Aachi	Rasam Powder	rasam-powder-100g-by-aachi	Curry Masalas	1.29	1	7	0.1	kg	FALSE	TRUE	MS-000002	30/09/2027
Homely	Black Chick Peas	black-chick-peas-1kg-by-homely-9395	Pulses & Beans	4.2	2.33	11	1	kg	FALSE	TRUE	F4-2	31/01/2027
Homely	Coconut Oil by Homely - 1L	coconut-oil-by-homely---1l-9404	Oils & Fats	7.99	4.38	0	1	l	FALSE	FALSE	I51
Oreo	Golden	oreo-golden-154-gm-by-oreo-9494	Snacks & Sweets	1.35	0.75	0	0.154	kg	FALSE	TRUE	OREO-GOLDEN-0G
Homely	Coriander Powder	coriander-powder-200gm-by-homely-9358	Whole & Ground Spices	2.25	1.16	4	0.2	kg	FALSE	TRUE	CORIANDER-POWDER-HOMELY-0G	31/01/2027
Tasty Nibbles	Ginger Coffee	ginger-coffee-150gm-by-tasty-nibbles-9436	Tea & Coffee	2.7	0	40	0.15	kg	FALSE	TRUE	GINGER-COFFEE-0G	30/06/2027
Homely	Star Anice	star-anice--100-gm-by-homely-9364	Whole & Ground Spices	4	2.19	20	0.1	g	FALSE	TRUE	L51	30/06/2027
Haldirams	Sweet Delight	sweet-delight-350g-by-haldirams-9482	Snacks & Sweets	7.99	4.49	3	0.35	g	FALSE	TRUE	L2 5	30/06/2026
Melam	Appam Idiyappam Podi	appam-idiyappam-podi-1kg-by-melam-9424	Flour & Grains	4.19	0	12	1	kg	FALSE	TRUE	R42	31/08/2027
GNG	Idli Batter Powder	idli-batter-powder-500-gm-by-gng-9414	Flour & Grains	3.5	1.38	15	0.5	g	FALSE	TRUE	C5-1	31/07/2026
Haldirams	Sweet Motichoor Ladoo	sweet-motichoor-ladoo-300gm-by-haldirams-9484	Snacks & Sweets	6.45	3.59	3	0.35	g	TRUE	TRUE	SWEET-MOTICHOOR-LADOO-0G	30/06/2026
Nescafe	3 in 1	nescafe-3-in-1-16-gm-by-nescafe-9492	Tea & Coffee	1.4	0.82	6	0.0016	g	TRUE	TRUE	O2	30/09/2026
Homely	Black Pepper Powder	black-pepper-powder-100gm-by-homely-9362	Whole & Ground Spices	3.35	1.88	5	0.1	kg	FALSE	TRUE	BLACK-PEPPER-POWDER-HOMELY-0G	31/01/2027
Homely	Cinnamon	cinnamon-100gm-by-homely-9354	Whole & Ground Spices	2.75	1.47	19	0.1	g	FALSE	TRUE	K53	30/06/2027
Quality	Easy Palappam	easy-palappam-1kg-by-quality-9416	Flour & Grains	3.5	1.15	12	1	kg	FALSE	TRUE	E4-2	31/07/2027
Homely	Chemba Puttu Podi	chemba-puttu-podi-500gm-by-homely-9383	Flour & Grains	2	1.1	118	0.5	g	FALSE	TRUE	K5	31/01/2027
Homely	Fennel	fennel-100gm-by-homely-9352	Whole & Ground Spices	1.9	1.05	21	0.1	kg	FALSE	TRUE	F3-3	30/06/2027
Chakra	Coriander Seeds	coriander-seeds-200gm-by-chakra-9442	Whole & Ground Spices	1.79	1.16	25	0.2	kg	FALSE	TRUE	H3-2	31/08/2026
Homely	Fish Masala	fish-masala-165gm-by-homely-9370	Curry Masalas	3.45	1.88	6	0.165	g	FALSE	TRUE	FMâ€“H-165	30/06/2027
Homely	Steam Puttu Podi	steam-puttu-podi--1-kg-by-homely-9381	Flour & Grains	2.95	1.59	54	1	g	FALSE	TRUE	C2-1	31/01/2027
Homely	Dried Tapioca	dried-tapioca-1kg-by-homely-9406	Fryums	4.75	2.61	8	1	kg	FALSE	TRUE	G4-1	31/01/2027
Homely	Chick Peas (white)	chick-peas-white-1kg-by-homely-9391	Pulses & Beans	5.5	3.12	4	1	kg	FALSE	TRUE	F5-1	31/01/2027
Quality	Malabar Pathiri	malabar-pathiri-1-kg-by-quality-9418	Flour & Grains	3.5		28	1	g	FALSE	TRUE	E5-1	31/07/2027
Chakra	Black Channa	black-channa-1kg-by-chakra-9426	Pulses & Beans	4.31	2.33	10	1	kg	FALSE	FALSE	E5-2	30/06/2026
Homely	Sambar Powder	sambar-powder-165-gm-by-homely-9377	Curry Masalas	2.95	1.57	4	0.165	g	FALSE	TRUE	SPâ€“H-165	31/01/2027
Heinz	Salad Cream Original	salad-cream-original-pm269-285-gm-by-heinz-9488	Seasonings & Condiments	3.53	2.06	10	0.285	g	TRUE	TRUE	O21	31/10/2026
Chakra	Fennel Seeds	fennel-seeds-200gm-by-chakra-9450	Whole & Ground Spices	4.32	0	12	0.2	kg	FALSE	TRUE	E1-2	31/07/2026
STF	Amla Pickle (With Garlic)	amla-pickle-with-garlic-300gm-by-stf-9422	Pickles & Preserves	2.75	0	7	300	g	FALSE	TRUE	AMLA-PICKLE-WITH-GARLIC-0G	31/07/2027
Maggi	Noodles Indian Masala	maggi-noodles-indian-masala-48gm-by-maggi-9490	Snacks & Sweets	0.29	0.16	32	0.048	g	FALSE	TRUE	O51	31/08/2026
KTC	Sunflower Oil	sunflower-oil-3-ltr-by-ktc-9456	Oils & Fats	9		3	3	g	FALSE	TRUE	P5 1	31/05/2027
Rajah	Chilli Powder	chilli-powder-400gm-by-rajah-9462	Whole & Ground Spices	4	2.23	9	0.4	g	FALSE	TRUE	RAJAH-CHILLI-POWDER-0G	30/09/2027
Harpic	Power Plus	power-plus-750ml-by-harpic-9486	Household & Cleaning	1.66	1.08	11	0.75	l	FALSE	TRUE	S52	31/07/2027
Homely	Coconut Oil by Homely - 500ML	coconut-oil-by-homely---500ml-9405	Oils & Fats	4.35	2.38	0	0.5	l	FALSE	FALSE	F3-1
Tasty Nibbles	Cabbage Thoran	cabbage-thoran-200gm-by-tasty-nibbles-9428	Ready to Eat	2.87	0	19	0.2	kg	FALSE	TRUE	M5-1	31/05/2027
GNG	Palappam Batter Powder	palappam-batter-powder-500-gm-by-gng-9412	Flour & Grains	3.5	1.15	13	0.5	g	FALSE	TRUE	PALAPPAM-BATTER-POWDER-GNG-0G	31/07/2026
Fairy	WUL Lemon washing Liquid	wul-lemon-washing-liquid-320-ml-by-fairy-9478	Household & Cleaning	1.55	0.85	9	0.32	l	TRUE	TRUE	S14
Oreo	Biscuits Original	biscuits-original-66gm-by-oreo-9460	Snacks & Sweets	1	0.55	0	0.066	kg	FALSE	TRUE	EWC-4- O3
Double Horse	Garlic Pickle	garlic-pickle-400-gm-by-double-horse-9420	Pickles & Preserves	3.85	0	5	0.4	kg	TRUE	TRUE	GARLIC-PICKLE-0G	28/02/2027
Homely	Uzhunnu	uzhunnu--500-gm-by-homely-9350	Pulses & Beans	3	1.61	0	0.5	kg	FALSE	TRUE	F3-2	30/06/2027
Homely	Whole Black Pepper	whole-black-pepper--100-gm-by-homely-9348	Whole & Ground Spices	3.45	1.89	0	0.1	kg	TRUE	TRUE	G5-1
Homely	Red Cow Peas	red-cow-peas-1-kg-by-homely-9397	Pulses & Beans	4.45	2.46	6	1	kg	FALSE	TRUE	D3 2	31/01/2027
Homely	Beef Ularthu Masala	beef-ularthu-masala-165gm-by-homely-9375	Curry Masalas	3.45	1.88	0	0.165	kg	FALSE	TRUE	BUMâ€“H-165	30/06/2027
Chakra	Cloves Whole	cloves-whole-200gm-by-chakra-9438	Whole & Ground Spices	7.55		19	0.2	g	FALSE	TRUE	D2-4/F2-3	31/07/2026
Chakra	Cumin Seeds (Jeera)	cumin-seeds-jeera-200gm-by-chakra-9444	Whole & Ground Spices	5.39		10	0.2	g	FALSE	TRUE	E1-3	31/08/2026
Homely	Palappam Powder	palappam-powder--500-gm-by-homely-9389	Flour & Grains	2.1	1.15	83	0.5	kg	FALSE	TRUE	B1-4	31/01/2027
Homely	Dal	dal-500gm-by-homely-9401	Pulses & Beans	2.89	1.59	37	0.5	kg	FALSE	TRUE	E5-3	31/01/2027
Homely	Idly Mix	idly-mix--500-gm-by-homely-9385	Flour & Grains	2.5	1.38	103	0.5	g	FALSE	TRUE	C3-4	31/01/2027
Tasty Nibbles	Dried Prawn	dried-prawn-100gm-by-tasty-nibbles-9448	Pickles & Preserves	4.31	0	18	0.1	kg	FALSE	TRUE	L21	30/06/2027
Homely	Pork Masala	pork-masala-165-gm-by-homely-9372	Curry Masalas	3.45	1.88	5	0.165	kg	FALSE	TRUE	PMâ€“H-165	30/06/2027
Homely	Dosa Mix	dosa-mix-500gm-by-homely-9387	Flour & Grains	2.1	1.15	91	0.5	g	FALSE	TRUE	A3-2	31/01/2027
Homely	Turmeric Powder	turmeric-powder--165-gm-by-homely-9360	Whole & Ground Spices	2	1.11	53	0.165	g	FALSE	TRUE	L33	31/01/2027
Homely	Moong ( cheeupayar )	moong--cheeupayar--1kg-by-homely-9393	Pulses & Beans	4.5	2.47	0	1	g	FALSE	TRUE	D5 1
Shan	Chicken Biryani	shan-chicken-biryani-75-gm-by-shan-9464	Curry Masalas	1.54	0.85	12	0.075	g	FALSE	TRUE	SHAN-CHICKEN-BIRYANI-0G	30/06/2028
STF	Cut Mango Pickle (With Garlic)	cut-mango-pickle-with-garlic-300gm-by-stf-9446	Pickles & Preserves	2.75	0	12	0.3	kg	FALSE	TRUE	CUT-MANGO-PICKLE-WITH-GARLIC-0G	31/07/2027
ELG	Sponge Scourers	sponge-scourers-10-pcs-by-elg-9476	Household & Cleaning	1.25	0.69	1	0.2	g	FALSE	TRUE	S15
Annapurna	Chakki Atta	chakki-atta-10kg-by-annapurna-9474	Flour & Grains	16	9.99	0	10	kg	FALSE	TRUE	ANNAPURNA-CHAKKI-ATTA-0G	30/06/2026
Haldirams	Sweet Besan Ladoo	sweet-besan-ladoo-400gm-by-haldirams-9480	Snacks & Sweets	3.6	1.99	2	0.4	g	FALSE	TRUE	K4 3	30/09/2026
151	Scouring Pads 4s	scouring-pads-4s-by-duzzit-9469	Household & Cleaning	1.12	0.69	1	0.25	g	FALSE	TRUE	S54
KTC	Butter Ghee	butter-ghee-500gm-by-ktc-9454	Oils & Fats	9.31	5.17	8	0.5	kg	FALSE	TRUE	KTC-BUTTER-GHEE-0G	31/10/2027
Chakra	Coriander powder	coriander-powder-500gm-by-chakra-9440	Whole & Ground Spices	4.79	0	0	0.5	kg	FALSE	TRUE	CORIANDER-POWDER-0G-3
Chakra	Chia Seeds	chia-seeds-200gm-by-chakra-9430	Whole & Ground Spices	3.23	0	23	0.2	kg	FALSE	TRUE	CHIA-SEEDS-0G	31/03/2027
Tameemi	Ragi Powder	ragi-powder-500-gm-by-tameemi-9410	Flour & Grains	1.75	0	16	0.5	kg	FALSE	TRUE	C4-2	31/07/2027
Homely	Rice Powder	rice-powder--1-kg-by-homely-9379	Flour & Grains	2.75	1.51	1	1	kg	TRUE	TRUE	C4-1	31/07/2027
Tameemi	Chemba Puttupodi	chemba-puttupodi-500gm-by-tameemi-9408	Flour & Grains	1.5	0	21	0.5	kg	FALSE	TRUE	C2-2	31/07/2027
Homely	Chicken Masala	chicken-masala-165gm-by-homely-9368	Curry Masalas	3.45	1.88	1	0.165	g	FALSE	TRUE	CMâ€“H-165	30/06/2027
Homely	Cumin	cumin-100gm-by-homely-9356	Whole & Ground Spices	2.25	1.12	12	0.1	g	FALSE	TRUE	G5-3	30/06/2027
Homely	Split Green Gram Dhal	split-green-gram-dhal--500-gm-by-homely-9399	Pulses & Beans	3.55	1.98	43	0.5	kg	FALSE	TRUE	K43	31/01/2027
Homely	Meat Masala	meat-masala-165-gm-by-homely-9366	Curry Masalas	3.35	1.87	3	0.165	g	TRUE	TRUE	MMâ€“H-165	30/06/2027
Heinz	Tomato Ketchup	tomato-ketchup-460gm-by-heinz-9452	Seasonings & Condiments	4.24	2.47	9	0.46	g	FALSE	TRUE	HEINZ-TOMATO-KETCHUP-0G	31/12/2026
Shalini	Ponni Boiled	ponni-boiled-10-kg-by-shalini-9299	Rices	16.99	0	0	10	kg	FALSE	TRUE	PONNI-BOILED-0G
Shalini	Ponni Raw	shalini-ponni-raw-10-kg-by-shalini-9301	Rices	16.55	0	0	10	g	FALSE	TRUE	SHALINI-PONNI-RAW-0G
Periyar	Puttu Podi	puttu-podi-1-kg-by-periyar-9269	Flour & Grains	2.39	0	0	1	kg	FALSE	TRUE	A3-1
Sakthi	Curryleaf Powder	curryleaf-powder-200gm-by-sakthi-9289	Seasonings & Condiments	1.69	0	0	0.2	kg	FALSE	TRUE	CURRYLEAF-POWDER-0G
Double Horse	Aval White Thick	aval-white-thick-400gm-by-double-horse-9218	Flour & Grains	1.55	0	0	0.4	kg	FALSE	TRUE	AVAL-WHITE-THICK-0G
Double horse	Jaya Rice By Double horse - 5 KG	jaya-rice-by-double-horse-5-kg-9240	Rices	9.99	0	30	5	g	FALSE	TRUE	JAYA-RICE-0G-2
Double Horse	Meat Masala	meat-masala-140-gm-by-double-horse-9241	Curry Masalas	2.15		57	0.14	g	FALSE	TRUE	N2	28/02/2027
Homely	Mixture Bombay  By Homely - 250 GM	mixture-bombay-by-homely-250-gm-9344	Snacks & Sweets	3.25	1.78	21	0.25	g	FALSE	TRUE	G1-1	30/06/2027
Homely	Spicy Mixture  By Homely - 250 GM	spicy-mixture-by-homely-250-gm-9326	Snacks & Sweets	2.86	1.59	18	0.25	g	FALSE	TRUE	E1-1	30/06/2027
Double Horse	Ragi Puttu Podi	ragi-puttu-podi-500-gm-by-double-horse-9246	Flour & Grains	1.75	0	18	0.5	kg	FALSE	TRUE	B2-3	01/08/2026
Double Horse	Roasted Vermicelli	roasted-vermicelli-by-double-horse-9256	Desserts	1.39	0	4	0.5	kg	FALSE	TRUE	I3-5	15/09/2026
Tharan	Cocunut Nut Oil	cocunut-nut-oil-1ltr-by-tharan-9307	Oils & Fats	7.25	0	1	1	g	FALSE	TRUE	I1-1	28/02/2027
Double Horse	Sambar Masala	sambar-mala-140-gm-by-double-horse-9258	Curry Masalas	1.99		28	0.14	g	FALSE	TRUE	SM-140	01/02/2027
Double Horse	Ginger & Garlic Paste	ginger-garlic-paste-400-gm-by-double-horse-9214	Pickles & Preserves	3.25	0	0	0.4	kg	FALSE	TRUE	GINGER-GARLIC-PASTE-0G	31/08/2026
Homely	Mixture Bombay  By Homely - 500 GM	mixture-bombay-by-homely-500-gm-9345	Snacks & Sweets	5.15	2.84	11	0.5	g	FALSE	TRUE	E3-3	30/06/2027
Double Horse	Rice Palada Payasam Mix	rice-palada-payasam-mix-300-gm-by-double-horse-9252	Desserts	1.99	0	20	0.3	kg	FALSE	FALSE	RICE-PALADA-PAYASAM-MIX-0G	30/11/2026
Tameemi	Steam Puttu Podi	steam-puttu-podi-1-kg-by-tameemi-9318	Flour & Grains	2.89		9	1	g	FALSE	TRUE	A5-2	31/07/2027
Tameemi	Roasted Rice Powder	roasted-rice-powder-1kg-by-tameemi-9316	Flour & Grains	2.59	0	22	1	kg	FALSE	TRUE	A2-1	31/07/2027
Tameemi	Pathiri Podi	pathiri-podi-1-kg-by-tameemi-9323	Flour & Grains	2.89		24	1	g	FALSE	TRUE	C3-2	31/07/2027
Periyar	Easy Palappam Podi	easy-palappam-podi-1-kg-by-periyar-9277	Flour & Grains	2.99	0	5	1	kg	FALSE	TRUE	A5-1	31/08/2026
Periyar	Chemba Puttu Podi	chemba-puttu-podi-1kg-by-periyar-9265	Flour & Grains	2.69	0	1	1	kg	FALSE	TRUE	B2-2	31/08/2026
Double horse	Chilli Powder by Double Horse - 500 GM	chilli-powder-by-double-horse-500-gm-9224	Whole & Ground Spices	4.75	0	20	0.5	kg	FALSE	TRUE	J3 2	01/02/2027
Tata Salt	Powder Salt	powder-salt-1-kg-by-tata-9305	Seasonings & Condiments	0.99	0	11	1	kg	FALSE	TRUE	R43	30/04/2027
Sakthi	Fish Fry Masala	fish-fry-masala-200gm-by-sakthi-9293	Curry Masalas	2.29		7	0.2	g	FALSE	TRUE	J4	30/09/2026
Tharan	Gingelly Oil	gingelly-oil-1-ltr-by-tharan-9309	Oils & Fats	7.49	0	7	1	l	FALSE	TRUE	G4-4	28/02/2027
Periyar	Matta Rice Flakes	matta-rice-flakes-400-gm-by-periyar-9281	Flour & Grains	1.59		0	0.4	g	FALSE	TRUE	B5-1
Homely	Tapioca Chips	tapioca-chips-250-gm-by-homely-9337	Snacks & Sweets	3.69	2.05	18	0.25	g	FALSE	TRUE	G2-3	30/06/2027
Periyar	Dosa Podi	dosa-podi-1kg-by-periyar-9275	Flour & Grains	2.99	0	0	1	kg	FALSE	TRUE	DOSA-PODI-0G
Double horse	Pappadam By Double horse - 100 GM	pappadam-by-double-horse-100-gm-9244	Fryums	1.59	0	0	0.1	g	FALSE	TRUE	H5-1
Periyar	Iddly Podi	iddly-podi-1-kg-by-periyar-9279	Flour & Grains	3.15	0	0	1	kg	FALSE	TRUE	B2-22
Double Horse	Semiya Payasam Mix	semiya-payasam-mix-300-gm-by-double-horse-9260	Desserts	1.99		18	0.3	g	FALSE	TRUE	SPM-300	30/11/2026
Double Horse	Roasted Ragi Powder 1 KG DH	roasted-ragi-powder-1-kg-dh-by-double-horse-9254	Flour & Grains	3.45	0	7	1	kg	FALSE	TRUE	B3-4	30/11/2026
Periyar	Idiyappam Podi	idiyappam-podi-1-kg-by-periyar-9267	Flour & Grains	2.39	0	0	1	kg	FALSE	TRUE	A2
Double Horse	Corn Puttu Podi	corn-puttu-podi-500gm-by-double-horse-9225	Flour & Grains	1.75		15	0.5	g	FALSE	TRUE	D4-1	31/08/2026
Homely	Kuzhalappam	kuzhalappam-200-gm-by-homely-9328	Snacks & Sweets	3.13	1.74	23	0.2	g	FALSE	TRUE	D4-4	30/06/2027
Sakthi	Sambar Powder	sambar-powder-200-gm-by-sakthi-9297	Curry Masalas	1.99		4	0.2	g	FALSE	TRUE	SP-200	30/09/2026
Periyar	Pathiri Podi	pathiri-podi-1-kg-by-periyar-9283	Flour & Grains	2.39	0	4	1	kg	FALSE	TRUE	B4-2	31/08/2026
Sakthi	Chicken Masala	chicken-masala-200gm-by-sakthi-9287	Curry Masalas	1.99	0	7	0.2	kg	FALSE	TRUE	CM-200	30/09/2026
Sakthi	Briyani Masala	briyani-masala-200gm-by-sakthi-9285	Curry Masalas	2.25	0	7	0.2	kg	FALSE	TRUE	BM-200	30/09/2026
Double horse	Pappadam By Double horse - 200 GM	pappadam-by-double-horse-200-gm-9245	Fryums	2.99	0	0	0.2	g	FALSE	TRUE	P4-3
Double horse	Easy Palappam by Double Horse - 1 KG	easy-palappam-by-double-horse-1-kg-9230	Flour & Grains	3.15	0	0	1	kg	FALSE	TRUE	3A2
Double Horse	Chicken Masala	chicken-masala-140gm-by-double-horse-9220	Curry Masalas	2		32	0.14	g	FALSE	TRUE	J2 1	28/02/2027
Double horse	Jaya Rice By Double horse - 10 KG	jaya-rice-by-double-horse-10-kg-9239	Rices	19	0	17	10	g	FALSE	TRUE	JAYA-RICE-0G
Homely	Jackfruit Chips	jackfruit-chips-250-gm-by-homely-9339	Snacks & Sweets	4.91	2.73	55	0.25	g	FALSE	TRUE	F2-2	30/06/2027
Double Horse	Ribbon Ada	ribbon-ada-200gm-by-double-horse-9248	Desserts	2.19		25	0.2	g	FALSE	TRUE	I3-3	15/12/2026
Double horse	Easy Palappam by Double Horse - 500 GM	easy-palappam-by-double-horse-500-gm-9231	Flour & Grains	1.75	0	0	0.5	kg	FALSE	TRUE	B3-1
Double Horse	Cut Mango Pickle	cut-mango-pickle-400gm-by-double-horse-9227	Pickles & Preserves	3.99		21	0.4	g	FALSE	TRUE	CUT-MANGO-PICKLE-0G	28/02/2027
Sakthi	Mutton Masala	mutton-masala-200-gm-by-sakthi-9295	Curry Masalas	2.29	0	9	0.2	kg	FALSE	TRUE	MM-200	30/09/2026
Homely	Banana Chips by Homely - 250 GM	banana-chips-by-homely-250-gm-9331	Snacks & Sweets	3.67	2.04	59	0.25	g	FALSE	TRUE	G2-1	30/06/2027
Sakthi	Fish Curry Masala	fish-curry-masala-200gm-by-sakthi-9291	Curry Masalas	1.99		9	0.2	g	FALSE	TRUE	FCM-200	30/09/2026
Homely	Pazham Chips	pazham-chips-150-gm-by-homely-9333	Snacks & Sweets	2.68	1.49	48	0.25	kg	FALSE	TRUE	G3-1	30/06/2027
Tata Salt	Crystal Salt	crystal-salt-1kg-by-tata-9303	Seasonings & Condiments	0.75	0	21	1	kg	FALSE	TRUE	Q5	30/09/2026
Homely	Pakkavada	pakkavada-175-gm-by-homely-9341	Snacks & Sweets	2.75	1.46	70	0.175	g	FALSE	TRUE	D3-4	30/06/2027
Double Horse	Aval Red Thick	aval-red-thick-500gm-by-double-horse-9216	Flour & Grains	1.75	0	2	0.5	kg	FALSE	TRUE	D5-4	31/12/2026
Periyar	Appam Podi	appam-podi-1kg-by-periyar-9273	Flour & Grains	2.39	0	7	1	kg	FALSE	TRUE	C3-1	31/08/2026
Homely	Banana Chips by Homely - 500 GM	banana-chips-by-homely-500-gm-9332	Snacks & Sweets	6.82	3.79	11	0.5	g	FALSE	TRUE	E4-4	30/06/2027
Periyar	Steamed Puttu Podi	steamed-puttu-podi-1-kg-by-periyar-9271	Flour & Grains	2.39		0	1	g	FALSE	TRUE	B4-1
Homely	Mustard	mustard-100-gm-by-homely-9346	Whole & Ground Spices	1.46	0.81	25	0.1	g	FALSE	TRUE	G3-3	30/06/2027
Double Horse	Easy Pathiri Podi	easy-pathiri-podi-1kg-by-double-horse-9232	Flour & Grains	2.75	0	2	1	kg	FALSE	TRUE	Q44	30/11/2028
Homely	Spicy Mixture  By Homely - 400 GM	spicy-mixture-by-homely-400-gm-9327	Snacks & Sweets	4.05	2.25	25	0.4	g	FALSE	TRUE	G3-2	30/06/2027
Homely	Sarkkara Varatty	sarkkara-varatty-250-gm-by-homely-9335	Snacks & Sweets	3.4	1.89	34	0.25	g	FALSE	TRUE	G4-2	30/06/2027
Double Horse	Fish Masala	fish-masala-140gm-by-double-horse-9234	Curry Masalas	2.25		60	0.14	g	FALSE	TRUE	I2-5	28/02/2027
Double Horse	Instant Parippu Pradhaman	instant-parippu-pradhaman-200-gm-by-double-horse-9236	Desserts	3.5		15	0.2	g	FALSE	TRUE	H1-3	31/01/2027
Double horse	Chilli Powder by Double Horse - 140 GM	chilli-powder-by-double-horse-140-gm-9223	Whole & Ground Spices	1.55	0	34	0.14	kg	FALSE	TRUE	CHILLI-POWDER-0G-2	28/02/2027
Chakra	Crushed Chillies	crushed-chillies-200gm-by-chakra-9189	Whole & Ground Spices	3	0	0	0.2	g	FALSE	TRUE	K22
Tasty Nibbles	Kappa Puzhukku	kappa-puzhukku-250-gm-by-tasty-nibbles-9112	Ready to Eat	2.5	0	22	0.25	kg	FALSE	TRUE	L3 2	30/11/2026
Chakra	Dried Curry Leaves by Chakra - 200 GM	dried-curry-leaves-by-chakra-200-gm-9193	Seasonings & Condiments	6		0	0.2	g	FALSE	TRUE	DCL-200
Tasty Nibbles	Soya Coconut Fry	soya-coconut-fry-200-gm-by-tasty-nibbles-9141	Ready to Eat	2.75	0	16	0.2	kg	FALSE	TRUE	SCF-200	31/07/2027
Double Horse	Idli Dosa Mix	1hr-idli-dosa-mix-1kg-by-double-horse	Flour & Grains	3.75	0	0	1	kg	FALSE	TRUE	B5-4
Tasty Nibbles	Tuna Tomato Rice	tuna-tomato-rice-250-gm-by-tasty-nibbles-9149	Ready to Eat	2	0	0	0.25	kg	FALSE	TRUE	H4-5
Chakra	Dried Curry Leaves by Chakra - 100 GM	dried-curry-leaves-by-chakra-100-gm-9192	Seasonings & Condiments	3.25		0	0.1	g	FALSE	TRUE	DCL-100
777	Hot Onion Pickle	hot-onion-pickle-300-gm-by-777-9170	Pickles & Preserves	1.5	0	0	0.3	kg	FALSE	TRUE	HOT-ONION-PICKLE-0G
Chakra	Kashmiri Chillies By Chakra - 100 GM	kashmiri-chillies-by-chakra-100-gm-9200	Whole & Ground Spices	2.55	0	7	0.1	kg	FALSE	TRUE	L31	30/09/2026
Chakra	Dried Ginger by Chakra - 100 GM	dried-ginger-by-chakra-100-gm-9195	Whole & Ground Spices	2.1	0	0	0.1	kg	FALSE	TRUE	DRIED-GINGER-0G
Tasty Nibbles	Fish Moilee	fish-moilee-200gm-by-tasty-nibbles-9104	Ready to Eat	3.45	0	10	0.2	kg	FALSE	TRUE	H2-2	31/07/2027
Tasty Nibbles	White Puttu Podi	white-puttu-podi-by-1-kg-by-tasty-nibbles-9079	Flour & Grains	2.85	1.69	35	1	kg	FALSE	TRUE	B3-2
777	Tomato Pickle	tomato-pickle-300-gm-by-777-9176	Pickles & Preserves	1.75	0	0	0.3	kg	FALSE	TRUE	TOMATO-PICKLE-0G
Chakra	Coriander Powder by Chakra - 100 GM	coriander-powder-by-chakra-100-gm-9187	Whole & Ground Spices	1.25		5	0.1	g	FALSE	TRUE	CORIANDER-POWDER-0G	31/07/2026
Tasty Nibbles	Light Meat Tuna Chunk	light-meat-tuna-chunk-185-gm-by-tasty-nibbles-9123	Ready to Eat	1.75	0	0	0.185	kg	FALSE	FALSE	LIGHT-MEAT-TUNA-CHUNK-0G
777	Amla Pickle	amla-pickle-300gm-by-777-9159	Pickles & Preserves	1.85	0	0	300	g	FALSE	TRUE	AMLA-PICKLE-GLASS-0G
777	Mahani Pickle	mahani-pickle-300-gm-by-777-9172	Pickles & Preserves	2.25	0	0	0.3	kg	FALSE	TRUE	MAHANI-PICKLE-0G
Tasty Nibbles	Banana Chips	banana-chips-100-gm-by-tasty-nibbles-9157	Snacks & Sweets	1.75	0	0	0.1	kg	FALSE	TRUE	BANANA-CHIPS-0G
Tasty Nibbles	Banana Powder	banana-powder-200-gm-by-tasty-nibbles-9087	Ready to Eat	4	0	8	0.2	kg	FALSE	TRUE	I2-4	31/10/2026
Tasty Nibbles	Fish Roast	fish-roast-200gm-by-tasty-nibbles-9108	Ready to Eat	4.25	0	5	0.2	kg	FALSE	TRUE	H4	31/10/2026
Chakra	Kashmiri Chillies By Chakra - 200 GM	kashmiri-chillies-by-chakra-200-gm-9201	Whole & Ground Spices	4.5	0	9	0.2	kg	FALSE	TRUE	KASHMIRI-CHILLIES-0G-2	30/09/2026
Tasty Nibbles	Aviyal Curry	aviyal-curry-200gm-by-tasty-nibbles-9085	Ready to Eat	2.45	0	0	0.2	kg	FALSE	TRUE	L12	31/07/2026
TASTY NIBBLES	Kerala Fish Curry Shapile Curry    By TASTY NIBBLES - 185 GM	kerala-fish-curry-shapile-curry-by-tasty-nibbles-185-gm-9117	Ready to Eat	3.25	0	5	0.185	kg	FALSE	TRUE	I4 3	31/07/2026
Tasty Nibbles	Sardine With Shredded Coconut	sardine-with-shredded-coconut-185-gm-by-tasty-nibbles-9139	Ready to Eat	2.75		1	0.185	g	FALSE	TRUE	I4 4	30/11/2026
Chakra	Tamarind Seedless	tamarind-seedless-200-gm-by-chakra-9206	Seasonings & Condiments	1.25		27	0.2	g	FALSE	TRUE	TS-200-2	30/06/2026
Tasty Nibbles	Tomato Rice	tomato-rice-250-gm-by-tasty-nibbles-9145	Ready to Eat	1.5	0	0	0.25	kg	FALSE	TRUE	H5-4
Tasty Nibbles	Light Meat Tuna Chunks salt	light-meat-tuna-chunks-salt-185-gm-by-tasty-nibbles-9125	Ready to Eat	1.75	0	0	0.185	kg	FALSE	FALSE	LIGHT-MEAT-TUNA-CHUNKS-SALT-0G
Tasty Nibbles	Prawn Mango Curry	prawn-mango-curry-185-gm-by-tasty-nibbles-9133	Ready to Eat	3.75	0	7	0.185	kg	FALSE	TRUE	I4 2	31/08/2026
Tasty Nibbles	Fish Kappa Biriyani	fish-kappa-biriyani-250gm-by-tasty-nibbles-9101	Ready to Eat	3.25	0	5	0.25	kg	FALSE	TRUE	J1-3	31/07/2027
Chakra	Bay Leaves	bay-leaves-100gm-by-chakra-9178	Whole & Ground Spices	2.37	0	4	0.1	kg	FALSE	TRUE	BAY-LEAVES-0G	31/07/2026
Tasty Nibbles	Boiled Cassava	boiled-cassava-250gm-by-tasty-nibbles-9089	Ready to Eat	2.45	0	24	0.25	kg	FALSE	TRUE	L43	31/08/2027
Tasty Nibbles	Traditional Sardine Curry	traditional-sardine-curry-185-gm-by-tasty-nibbles-9147	Ready to Eat	3		1	0.185	g	FALSE	TRUE	I4 1	30/11/2026
TASTY NIBBLES	Kerala Fish Curry Shapile Curry    By TASTY NIBBLES - 200 GM	kerala-fish-curry-shapile-curry-by-tasty-nibbles-200-gm-9118	Ready to Eat	3.5	0	16	0.2	kg	FALSE	TRUE	K2-3	31/07/2027
Tasty Nibbles	Fish Biriyani	fish-biriyani-250gm-by-tasty-nibbles-9099	Ready to Eat	3.75		22	0.25	g	FALSE	TRUE	FBTN-250	30/11/2026
Tasty Nibbles	Fish Pollichath	fish-pollichath-200gm-by-tasty-nibbles-9106	Ready to Eat	4.25	0	0	0.2	kg	FALSE	TRUE	E2-3
Tasty Nibbles	Prawns Roast	prawns-roast-200-gm-by-tasty-nibbles-9135	Ready to Eat	4.5	0	20	0.2	kg	FALSE	TRUE	I2-2	30/11/2026
Chakra	Dried Ginger by Chakra - 200 GM	dried-ginger-by-chakra-200-gm-9196	Whole & Ground Spices	3.75	0	0	0.2	kg	FALSE	TRUE	M2 2
Tasty Nibbles	Veg Pulavu	veg-pulavu-250-gm-by-tasty-nibbles-9153	Ready to Eat	2.25	0	0	0.25	kg	FALSE	TRUE	H4-3
Tasty Nibbles	Kootu Curry	kootu-curry-200-gm-by-tasty-nibbles-9121	Ready to Eat	2.5		0	0.2	g	FALSE	TRUE	E2-2
777	Ginger Pickle	ginger-pickle-300-gm-by-777-9166	Pickles & Preserves	1.65	0	0	0.3	kg	FALSE	TRUE	GINGER-PICKLE-0G
Chakra	Black Cardamom	black-cardamom-100gm-by-chakra-9180	Whole & Ground Spices	3.25	0	0	0.1	kg	FALSE	TRUE	BLACK-CARDAMOM-0G
Tasty Nibbles	Kadala Curry	kadala-curry-200-gm-by-tasty-nibbles-9110	Ready to Eat	2.45	0	5	0.2	g	FALSE	TRUE	L11	30/11/2026
Tasty Nibbles	Prawn Mango Curry	prawn-mango-curry-200-gm-by-tasty-nibbles-9131	Ready to Eat	4	0	2	0.2	kg	FALSE	TRUE	I2-1	31/08/2026
Tasty Nibbles	Boiled Koorka	boiled-koorka-300gm-by-tasty-nibbles-9091	Ready to Eat	3	0	9	0.3	kg	FALSE	TRUE	I5 2	31/08/2027
Tasty Nibbles	Coconut Rice	coconut-rice-250gm-by-tasty-nibbles-9095	Ready to Eat	1.75	0	0	0.25	kg	FALSE	TRUE	H4-1
Tasty Nibbles	Appam Idiyappam Podi	appam-idiyappam-podi-1kg-by-tasty-nibbles-9075	Flour & Grains	2.75	0	10	1	kg	FALSE	TRUE	B4-4
Tasty Nibbles	Vegetable Fish Curry	vegetable-fish-curry-200-gm-by-tasty-nibbles-9155	Ready to Eat	2.75	0	0	0.2	kg	FALSE	TRUE	H4-2
Chakra	Long Red Chillies Without Stem By Chakra - 200 GM	long-red-chillies-without-stem-by-chakra-200-gm-9204	Whole & Ground Spices	3.4		5	0.2	g	FALSE	TRUE	LONG-RED-CHILLIES-WITHOUT-STEM-0G-2	30/09/2026
Tasty Nibbles	Tiffin Sambar	tiffin-sambar-200-gm-by-tasty-nibbles-9143	Ready to Eat	2.25	0	0	0.2	kg	FALSE	TRUE	TS-200
Tasty Nibbles	Chakka Varatty	chakka-varatty-200gm-by-tasty-nibbles-9093	Desserts	4.5	0	5	0.2	kg	FALSE	TRUE	I2-3	30/11/2026
Tasty Nibbles	Easy Idiyappam Podi	easy-idiyappam-podi-1kg-by-tasty-nibbles-9077	Flour & Grains	2.75	0	0	1	kg	FALSE	FALSE	A4-2
Chakra	Long Red Chillies Without Stem By Chakra - 500 GM	long-red-chillies-without-stem-by-chakra-500-gm-9205	Whole & Ground Spices	7.5		8	0.5	g	FALSE	TRUE	LONG-RED-CHILLIES-WITHOUT-STEM-0G-3	30/09/2026
Tasty Nibbles	Masala Rice	masala-rice-250-gm-by-tasty-nibbles-9127	Ready to Eat	1.5	0	0	0.25	g	FALSE	TRUE	H5-3
777	Mixed Pickle	mixed-pickle-300-gm-by-777-9174	Pickles & Preserves	1.75	0	0	0.3	kg	FALSE	TRUE	MIXED-PICKLE-0G
Tasty Nibbles	Ulli Theeyal	ulli-theeyal-200-gm-by-tasty-nibbles-9151	Ready to Eat	2.49	0	0	0.2	kg	FALSE	TRUE	UT-200
777	Green Chilly Pickle	green-chilly-pickle-300-gm-by-777-9168	Pickles & Preserves	1.55	0	0	0.3	kg	FALSE	TRUE	GREEN-CHILLY-PICKLE-0G
Tasty Nibbles	Kerala Fish Curry With Coconut Milk	kerala-fish-curry-with-coconut-milk-200-gm-by-tasty-nibbles-9119	Ready to Eat	3.45		21	0.2	g	FALSE	TRUE	H1-1	31/07/2027
Tasty Nibbles	Sambar Curry	sambar-curry-200-gm-by-tasty-nibbles-9137	Ready to Eat	2.5	0	5	0.2	kg	FALSE	TRUE	H3-1	30/06/2027
Tasty Nibbles	Angamaly Mango Curry	angamaly-mango-curry-200gm-by-tasty-nibbles-9083	Ready to Eat	3	0	8	0.2	g	FALSE	TRUE	K32	31/08/2026
Chakra	Coconut Oil	coconut-oil-1ltr-by-chakra-9184	Oils & Fats	6.99	0	0	1	l	FALSE	TRUE	CO-1000
Tasty Nibbles	Anchovy Curry	anchovy-curry-185gm-by-tasty-nibbles-9081	Ready to Eat	2.5	0	0	185	g	FALSE	TRUE	MS-000001
Tasty Nibbles	Kerala Fish Curry Chilli	kerala-fish-curry-chilli-200-gm-by-tasty-nibbles-9114	Ready to Eat	3.45		8	0.2	g	FALSE	TRUE	K1	31/07/2027
Chakra	Long Red Chillies Without Stem By Chakra - 100 GM	long-red-chillies-without-stem-by-chakra-100-gm-9203	Whole & Ground Spices	1.9		2	0.1	g	FALSE	TRUE	L3 1	30/09/2026
Tasty Nibbles	Cooked Matta Rice	cooked-matta-rice-250gm-by-tasty-nibbles-9097	Ready to Eat	2.25	0	0	0.25	g	FALSE	TRUE	H5-2
Tasty Nibbles	Pavakka Theeyal	pavakka-theeyal-200-gm-by-tasty-nibbles-9129	Ready to Eat	2.5	0	0	0.2	kg	FALSE	TRUE	H4-4
Ajmi	Tapioca Round	tapioca-round-150-gm-by-ajmi-8974	Snacks & Sweets	2.2	0	0	0.15	kg	FALSE	TRUE	TAPIOCA-ROUND-AJMI-0G
Tasty Nibbles	Rice Palada	rice-palada-200-gm-by-tasty-nibbles-9054	Desserts	1.75	0	0	0.2	kg	FALSE	TRUE	RICE-PALADA-TASTY-NIBBLES-0G
Ajmi	Kerala Mixture	kerala-mixture-350-gm-by-ajmi-8966	Snacks & Sweets	3	0	0	0.35	kg	FALSE	TRUE	KERALA-MIXTURE-AJMI-0G
TASTY NIBBLES	Roasted Vermicelli  By TASTY NIBBLES - 400 GM	roasted-vermicelli-by-tasty-nibbles-400-gm-9058	Desserts	2		3	0.4	g	FALSE	TRUE	I3-1	30/11/2026
Ajmi	Bombay Mixture	bombay-mixture-300gm-by-ajmi-8964	Snacks & Sweets	3	0	0	0.3	g	FALSE	TRUE	BMA-300
Ajmi	Easy Palappam Podi	easy-palappam-podi-1kg-by-ajmi-8950	Flour & Grains	2.9	0	0	1	kg	FALSE	TRUE	EASY-PALAPPAM-PODI-0G
Ajmi	Biriyani Masala	biriyani-masala-100gm-by-ajmi-8976	Curry Masalas	2.2	0	0	0.1	kg	FALSE	TRUE	BIRIYANI-MASALA-AJMI-0G
Ajmi	Palada Payasam Mix	palada-payasam-mix-200-gm-8936	Desserts	2.08	0	0	0.2	kg	FALSE	TRUE	PALADA-PAYASAM-MIX-0G
Ajmi	Chemba Puttupodi	chemba-puttupodi-1kg-by-ajmi-8946	Flour & Grains	3.1	0	0	1	kg	FALSE	TRUE	CHEMBA-PUTTUPODI-0G
Ajmi	Roasted Vermicelli	roasted-vermicelli-400-gm-8938	Desserts	1.86	0	0	0.4	kg	FALSE	TRUE	ROASTED-VERMICELLI-0G	30/09/2026
Ajmi	Dosa Podi	dosa-podi-1kg-by-ajmi-8948	Flour & Grains	3.5	0	0	1	kg	FALSE	TRUE	AJMI-DOSA-PODI-0G
Melam	Meat Masala	meat-masala-200-gm-by-melam-9029	Curry Masalas	2.75	0	0	0.2	kg	FALSE	TRUE	MMM-200
Tasty Nibbles	Cut Mango Pickle	cut-mango-pickle-400gm-by-tasty-nibbles-9061	Pickles & Preserves	2.75	0	24	0.4	kg	FALSE	TRUE	CUT-MANGO-PICKLE-TASTY-NIBBLES-0G	30/11/2027
Ajmi	Kerala Mixture Extra Hot	kerala-mixture-extra-hot-350-gm-by-ajmi-8968	Snacks & Sweets	3	0	0	0.35	kg	FALSE	TRUE	KERALA-MIXTURE-EXTRA-HOT-AJMI-0G
Double Horse	Roasted White Rice Powder	roasted-white-rice-powder-1-kg-by-double-horse-9006	Flour & Grains	2.75		6	1	g	FALSE	TRUE	A4-3	30/09/2026
Ajmi	Ragi Powder	ragi-powder-500gm-by-ajmi-8960	Flour & Grains	1.5	0	1	0.5	kg	FALSE	TRUE	B1-2	31/10/2026
Ajmi	Idli Podi	idli-podi-1-kg-by-ajmi-8956	Flour & Grains	3.12	0	0	1	kg	FALSE	TRUE	IDLI-PODI-AJMI-0G
Ajmi	Vermicelli Payasam Mix	vermicelli-payasam-mix-200-gm-8940	Desserts	2.07	0	0	0.2	kg	FALSE	TRUE	VERMICELLI-PAYASAM-MIX-0G
Double Horse	Dates Pickles	dates-pickles-400gm-by-double-horse-8983	Pickles & Preserves	3		34	0.4	g	FALSE	TRUE	DATES-PICKLES-DOUBLE-HORSE-0G	30/11/2026
Double Horse	Ginger Pickle	ginger-pickle-400-gm-by-double-horse-8985	Pickles & Preserves	2.5	0	0	0.4	kg	FALSE	TRUE	GINGER-PICKLE-DOUBLE-HORSE-0G
Ajmi	Tender Mango Pickle	tender-mango-pickle-400-gm-8942	Pickles & Preserves	3.7	0	0	0.4	kg	FALSE	TRUE	TENDER-MANGO-PICKLE-0G
Melam	Egg Roast Masala	egg-roast-masala-200gm-by-melam-9025	Curry Masalas	2.75		1	0.2	g	FALSE	TRUE	ERMM-200	31/07/2026
Ajmi	Kuzhalappam	kuzhalappam-200-gm-by-ajmi-8970	Snacks & Sweets	2.25	0	0	0.2	kg	FALSE	TRUE	KUZHALAPPAM-AJMI-0G
Tasty Nibbles	Masala Fried Prawn	masala-fried-prawn-50-gm-by-tasty-nibbles-9069	Ready to Eat	3	0	14	0.05	kg	FALSE	TRUE	E3-2	31/05/2027
Tasty Nibbles	Soya Chunks Nano	soya-chunks-nano-200-gm-by-tasty-nibbles-9037	Pulses & Beans	1.75		0	0.2	g	FALSE	TRUE	N5 2
Melam	Tender Mango Pickle	tender-mango-pickle-400-gm-by-melam-9017	Pickles & Preserves	4		0	0.4	g	FALSE	TRUE	TENDER-MANGO-PICKLE-MELAM-0G	31/07/2026
Double Horse	Chemba Puttu Podi	chemba-puttu-podi-1kg-by-double-horse-9000	Flour & Grains	3.5	0	12	1	kg	FALSE	TRUE	A1 2	15/12/2026
Double Horse	Lime Pickle	lime-pickle-400-gm-by-double-horse-8989	Pickles & Preserves	2.75	0	20	0.4	kg	FALSE	TRUE	LIME-PICKLE-DOUBLE-HORSE-0G	31/07/2027
Melam	Chicken Masala	chicken-masala-200gm-by-melam-9021	Curry Masalas	2.65		1	0.2	g	FALSE	TRUE	CMM-200	31/07/2026
Double Horse	White Puttu Podi	white-puttu-podi-1-kg-by-double-horse-9008	Flour & Grains	2.75	0	44	1	kg	FALSE	TRUE	WHITE-PUTTU-PODI-DOUBLE-HORSE-0G	15/11/2026
Ajmi	White Lime Pickle	white-lime-pickle-400-gm-by-ajmi-8944	Pickles & Preserves	2.6		0	0.4	g	FALSE	TRUE	WHITE-LIME-PICKLE-0G
Double Horse	Hot & Sweet Lime dates Pickle	hot-sweet-lime-dates-pickle-400gm-by-double-horse-8987	Pickles & Preserves	2.75	0	40	0.4	kg	FALSE	TRUE	HOT-AND-SWEET-LIME-DATES-DOUBLE-HORSE-0G	31/07/2027
Double Horse	Vinegar	vinegar-1-ltr-by-double-horse-8933	Seasonings & Condiments	3.75	0	0	1	l	FALSE	TRUE	I1-2
Melam	Coriander Powder	coriander-powder-1kg-by-melam-9023	Whole & Ground Spices	7	0	4	1	kg	FALSE	TRUE	CORIANDER-POWDER-MELAM-0G	31/07/2026
TASTY NIBBLES	Synthetic Vinegar  By TASTY NIBBLES - 500 ML	synthetic-vinegar-by-tasty-nibbles-500-ml-9041	Seasonings & Condiments	1.39	0	0	0.5	l	FALSE	TRUE	I1-4
Tasty Nibbles	Ada Pradhaman	ada-pradhaman-200gm-by-tasty-nibbles-9050	Desserts	3.45	0	17	0.2	kg	FALSE	TRUE	H2-1	31/08/2027
Melam	Mango Pickle	mango-pickle-400-gm-by-melam-9015	Pickles & Preserves	2.75	0	0	0.4	kg	FALSE	TRUE	MANGO-PICKLE-MELAM-0G
Tasty Nibbles	Mango Ginger Pickle	mango-ginger-pickle-400-gm-by-tasty-nibbles-9067	Pickles & Preserves	2.75	0	5	0.4	kg	FALSE	TRUE	MANGO-GINGER-PICKLE-TASTY-NIBBLES-0G	30/06/2027
Melam	Lime Pickle	lime-pickle-400-gm-by-melam-9013	Pickles & Preserves	2.75	0	0	0.4	kg	FALSE	TRUE	LIME-PICKLE-MELAM-0G
Ajmi	Rice Flakes Matta	rice-flakes-matta-400-gm-8934	Ready to Eat	1.77	0	0	0.4	kg	FALSE	TRUE	RICE-FLAKES-MATTA-0G
Double Horse	Avalose Podi	avalose-podi-500gm-by-double-horse-8998	Snacks & Sweets	2.75	0	0	0.5	kg	FALSE	TRUE	AVALOSE-PODI-DH-0G
Tasty Nibbles	Ginger Paste	ginger-paste-400-gm-by-tasty-nibbles-9048	Pickles & Preserves	3.45	0	12	0.4	kg	FALSE	TRUE	GINGER-PASTE-TASTY-NIBBLES-0G	30/06/2027
Ajmi	Steammade Puttupodi	steammade-puttupodi-5-kg-by-ajmi-8962	Flour & Grains	12.6	0	0	5	kg	FALSE	FALSE	STEAMMADE-PUTTUPODI-AJMI-0G
Double Horse	Idly Rava	idly-rava-1-kg-by-double-horse-9004	Flour & Grains	3	0	23	1	g	FALSE	TRUE	A5-4	31/01/2027
Tasty Nibbles	Anchovy Pickle	anchovy-pickle-400gm-by-tasty-nibbles-9059	Pickles & Preserves	5.75	0	8	0.4	kg	FALSE	TRUE	ANCHOVY-PICKLE-TASTY-NIBBLES-0G	30/06/2027
Ajmi	Steammade Puttupodi	steammade-puttupodi-1kg-by-ajmi-8952	Flour & Grains	3	0	0	1	kg	FALSE	FALSE	AJMI-FRESHMADE-RICE-POWDER-0G
Ajmi	Fish Masala	fish-masala-200gm-by-ajmi-8978	Curry Masalas	2.75	0	0	0.2	kg	FALSE	TRUE	J4 5
Tasty Nibbles	Fish Pickle	fish-pickle-400gm-by-tasty-nibbles-9063	Pickles & Preserves	5.75	0	13	0.4	kg	FALSE	TRUE	FISH-PICKLE-TASTY-NIBBLES-0G	31/07/2027
TASTY NIBBLES	Tamarind  Valanpuli  By TASTY NIBBLES - 500 GM	tamarind-valanpuli-by-tasty-nibbles-500-gm-9044	Seasonings & Condiments	3		5	0.5	g	FALSE	TRUE	TAMARIND-VALANPULI-TASTY-NIBBLES-0G-2	31/08/2026
Tasty Nibbles	Prawn Pickle	prawn-pickle-400-gm-by-tasty-nibbles-9071	Pickles & Preserves	5.75	0	0	0.4	kg	FALSE	TRUE	PRAWN-PICKLE-TASTY-NIBBLES-0G
Melam	Rasam Mix	rasam-mix-200-gm-by-melam-9033	Curry Masalas	2.75	0	8	0.2	kg	FALSE	TRUE	RMM-200	31/07/2026
Double Horse	Easy Idiyappam Powder White	easy-idiyappam-powder-white-1kg-by-double-horse-9002	Flour & Grains	2.75	0	0	1	kg	FALSE	TRUE	A2 2
Tasty Nibbles	Tamarind (kudampuli)	tamarind-kudampuli-200-gm-by-tasty-nibbles-9046	Seasonings & Condiments	2.9	0	0	0.2	kg	FALSE	TRUE	K31
Double Horse	Matta Rice	matta-rice-by-double-horse-10-kg-9011	Rices	12.49	0	5	10	g	FALSE	TRUE	MATTA-RICE-DOUBLE-HORSE-0G
Double Horse	Matta Rice	matta-rice-by-double-horse-5-kg-9012	Rices	9	0	0	5	kg	FALSE	TRUE	MATTA-RICE-DOUBLE-HORSE-0G-2
Melam	Sambar Powder	sambar-powder-200-gm-by-melam-9035	Curry Masalas	2.75		3	0.2	g	FALSE	TRUE	J5-3	31/07/2026
Ajmi	Pathiri Podi	pathiri-podi-1-kg-by-ajmi-8958	Flour & Grains	3	0	6	1	kg	FALSE	TRUE	A1-3	30/09/2026
Double Horse	White Lime Pickle	white-lime-pickle-400gm-by-double-horse-8994	Pickles & Preserves	2.75		40	0.4	g	FALSE	TRUE	WHITE-LIME-PICKLE-DOUBLE-HORSE-0G	30/11/2026
TASTY NIBBLES	Synthetic Vinegar  By TASTY NIBBLES - 1 L	synthetic-vinegar-by-tasty-nibbles-1-l-9040	Seasonings & Condiments	2.75	0	0	1	l	FALSE	TRUE	I1-3
Ajmi	Sarkaravaratty	sarkaravaratty-250-gm-by-ajmi-8972	Snacks & Sweets	2.75	0	0	0.25	kg	FALSE	TRUE	G4-3
TASTY NIBBLES	Roasted Vermicelli  By TASTY NIBBLES - 200 GM	roasted-vermicelli-by-tasty-nibbles-200-gm-9057	Desserts	1.35		2	0.2	g	FALSE	TRUE	I3-2	30/11/2026
Melam	Biriyani Masala	biriyani-masala-100gm-by-melam-9019	Curry Masalas	1.75	0	8	0.1	kg	FALSE	TRUE	BMM-100	31/07/2026
TASTY NIBBLES	Tamarind  Valanpuli  By TASTY NIBBLES - 200 GM	tamarind-valanpuli-by-tasty-nibbles-200-gm-9043	Seasonings & Condiments	1.4		0	0.2	g	FALSE	TRUE	TAMARIND-VALANPULI-TASTY-NIBBLES-0G
Melam	Fish Masala	fish-masala-200gm-by-melam-9027	Curry Masalas	2.75		6	0.2	g	FALSE	TRUE	FISH-MASALA-MELAM-0G	31/07/2026
Ajmi	Idiyappam Podi	idiyappam-podi-1-kg-by-ajmi-8954	Flour & Grains	2.83	0	0	1	kg	FALSE	TRUE	A4-
Tasty Nibbles	Instant Vermicelli Kheer Mix	instant-vermicelli-kheer-mix-200-gm-by-tasty-nibbles-9052	Desserts	2	0	0	0.2	kg	FALSE	TRUE	IVKMTN-200
Melam	Mutton Masala	mutton-masala-200-gm-by-melam-9031	Curry Masalas	2.75		4	0.2	g	FALSE	TRUE	MMM-200-2	31/07/2026
Tasty Nibbles	Sardine Pickle	sardine-pickle-400-gm-by-tasty-nibbles-9073	Pickles & Preserves	5.75	0	9	0.4	kg	FALSE	TRUE	SARDINE-PICKLE-TASTY-NIBBLES-0G	31/07/2027
`;

async function run() {
    console.log("Starting data transformation...");

    const lines = rawData.trim().split('\n');
    const rows = lines.slice(1);

    const productGroups = new Map<string, any[]>();

    for (const row of rows) {
        const cols = row.split('\t');
        if (cols.length < 5) continue;

        const rawBrand = cols[0]?.trim();
        const rawName = cols[1]?.trim();
        const rawCategory = cols[3]?.trim();
        const rawPrice = parseFloat(cols[4]) || 0;
        const rawCost = parseFloat(cols[5]) || 0;
        const rawStock = parseInt(cols[6]) || 0;
        const rawWeight = cols[7]?.trim();
        const rawUnit = cols[8]?.trim();
        const rawLocation = cols[11]?.trim();

        // 1. Clean Product Name: Remove brand and extra info
        let cleanName = rawName
            .replace(new RegExp(rawBrand, 'gi'), '')
            .replace(/standard size/gi, '')
            .replace(/by Homely/gi, '')
            .replace(/–/g, '')
            .replace(/-/g, ' ')
            .trim();

        // Remove trailing weight patterns if they exist in name (e.g. "1kg")
        cleanName = cleanName.replace(/\d+\s*(kg|g|l|ml|pcs|pods|bags)/gi, '').trim();
        // Capitalize
        cleanName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);

        // 2. Clean Warehouse Location: ^[A-Z]{1,2}-?\d+
        let cleanLocation = null;
        if (rawLocation && /^[A-Z]{1,2}\s*-?\d+/.test(rawLocation)) {
            cleanLocation = rawLocation.toUpperCase().replace(/\s+/g, '-');
        }

        // 3. Weight/Unit/Attribute Parsing
        let weight = parseFloat(rawWeight) || null;
        let unit = rawUnit || 'Kg';

        // If weight is null, try to extract from name
        if (weight === null) {
            const match = rawName.match(/(\d+(\.\d+)?)\s*(kg|g|l|ml|pcs|pods|bags)/i);
            if (match) {
                weight = parseFloat(match[1]);
                unit = match[3].toLowerCase();
            }
        }

        const attribute = weight ? `${weight} ${unit}` : null;

        const productData = {
            id: randomUUID(),
            name: cleanName,
            brand: rawBrand,
            category: rawCategory,
            price: rawPrice,
            cost_price: rawCost,
            stock: rawStock,
            weight,
            unit,
            attribute,
            warehouse_location: cleanLocation,
            gtin: rawLocation, // Original value kept in GTIN
            main_category: rawCategory,
            sub_category: null,
            tax_rate: null,
            product_type: 'simple'
        };

        const key = `${rawBrand}|${cleanName}|${rawCategory}`.toLowerCase();
        const list = productGroups.get(key) || [];
        list.push(productData);
        productGroups.set(key, list);
    }

    console.log(`Grouped into ${productGroups.size} distinct product types.`);

    // Prepare final insert arrays
    const finalProducts: any[] = [];
    const finalVariants: any[] = [];

    for (const [key, items] of productGroups) {
        if (items.length === 1) {
            finalProducts.push(items[0]);
        } else {
            // Variable product
            const parent = { ...items[0], id: randomUUID(), product_type: 'variable' };
            finalProducts.push(parent);

            // Consolidate variants with same attribute/name
            const consolidatedVariants = new Map<string, any>();

            items.forEach(item => {
                const variantName = item.attribute || item.name;
                const existing = consolidatedVariants.get(variantName);

                if (existing) {
                    // Merge stock
                    existing.stock += item.stock;
                    // Keep the higher price or average? Let's keep the one already there for now,
                    // or we could update if this one is more expensive.
                    // Usually stock is summed, price might need a check.
                    console.log(`Consolidating duplicate variant "${variantName}" for "${parent.name}" (Stock: ${existing.stock - item.stock} + ${item.stock})`);
                } else {
                    consolidatedVariants.set(variantName, {
                        id: randomUUID(),
                        product_id: parent.id,
                        variant_name: variantName,
                        price_adjustment: item.price - parent.price,
                        stock: item.stock,
                        weight_grams: item.unit.toLowerCase() === 'kg' ? (item.weight * 1000) : item.weight,
                        is_active: true
                    });
                }
            });

            consolidatedVariants.forEach(variant => {
                finalVariants.push(variant);
            });
        }
    }

    console.log(`Summary:`);
    console.log(`- Total Parent Products: ${finalProducts.length}`);
    console.log(`- Total Variants: ${finalVariants.length}`);
    console.log(`- Cleaned Name Example: "${finalProducts[0].name}"`);
    console.log(`- Attribute Example: "${finalProducts[0].attribute}"`);

    // Write to a temporary JSON for user review
    fs.writeFileSync('cleaned_products_preview.json', JSON.stringify({
        products: finalProducts.slice(0, 10),
        variants: finalVariants.slice(0, 5)
    }, null, 2));

    console.log("\nPreview saved to 'cleaned_products_preview.json'.");
    console.log("I am now ready to upload once you drop the database trigger.");
}

run();
