# Реестр 3D-анимаций техники

Покрытие: **6 из 114** упражнений. Каждое отсутствующее — открытый пункт (не «готово»).

Источник всех файлов — собственный 3D-пайплайн RYNJI (`tools/anim`): процедурная анатомическая фигура (three.js), движения по биомеханике упражнения, рендер в headless Chromium (WebGL2) → зацикленный WebP. Сторонние модели, фото и лицензированные анимации не используются. Воспроизведение офлайн (файлы в сборке).

Подсветка: основные мышцы — ярко-зелёные, вспомогательные — бледно-жёлто-зелёные, остальные — серые.

| exercise_id | название | тип | мышцы (основные / вспомогательные) | animation_asset | источник / лицензия | offline_ok | checked |
|---|---|---|---|---|---|---|---|
| bench_press | Жим штанги лёжа | h_push | Грудь / Трицепс, deltoids | assets/anim/bench_press.webp (279 КБ) | собственный 3D-рендер RYNJI (tools/anim), права наши | да | да |
| incline_bench_press | Жим штанги на наклонной | h_push | Грудь / deltoids, Трицепс | **нет — открытый пункт** | — | — | — |
| db_bench_press | Жим гантелей лёжа | h_push | Грудь / Трицепс, deltoids | **нет — открытый пункт** | — | — | — |
| incline_db_press | Жим гантелей на наклонной | h_push | Грудь / deltoids, Трицепс | **нет — открытый пункт** | — | — | — |
| decline_bench_press | Жим штанги с отрицательным наклоном | h_push | Грудь / Трицепс | **нет — открытый пункт** | — | — | — |
| machine_chest_press | Жим в тренажёре от груди | h_push | Грудь / Трицепс, deltoids | **нет — открытый пункт** | — | — | — |
| smith_bench_press | Жим лёжа в Смите | h_push | Грудь / Трицепс, deltoids | **нет — открытый пункт** | — | — | — |
| db_fly | Разведение гантелей лёжа | fly | Грудь / deltoids | **нет — открытый пункт** | — | — | — |
| incline_db_fly | Разведение гантелей на наклонной | fly | Грудь / deltoids | **нет — открытый пункт** | — | — | — |
| cable_crossover | Сведение в кроссовере | fly | Грудь / deltoids | **нет — открытый пункт** | — | — | — |
| pec_deck | Сведение рук в тренажёре (бабочка) | fly | Грудь / deltoids | **нет — открытый пункт** | — | — | — |
| push_up | Отжимания от пола | h_push | Грудь / Трицепс, deltoids, Пресс | **нет — открытый пункт** | — | — | — |
| incline_push_up | Отжимания с опорой на возвышение | h_push | Грудь / Трицепс, deltoids | **нет — открытый пункт** | — | — | — |
| decline_push_up | Отжимания с ногами на возвышении | h_push | Грудь / deltoids, Трицепс | **нет — открытый пункт** | — | — | — |
| chest_dip | Отжимания на брусьях (грудь) | h_push | Грудь / Трицепс, deltoids | **нет — открытый пункт** | — | — | — |
| deadlift | Становая тяга | hinge | lower-back, gluteal, hamstring / upper-back, trapezius, quadriceps, forearm | **нет — открытый пункт** | — | — | — |
| trap_bar_deadlift | Тяга с трэп-грифом | hinge | gluteal, quadriceps, lower-back / hamstring, trapezius, forearm | **нет — открытый пункт** | — | — | — |
| pull_up | Подтягивания | v_pull | upper-back / Бицепс, forearm, trapezius | **нет — открытый пункт** | — | — | — |
| chin_up | Подтягивания обратным хватом | v_pull | upper-back, Бицепс / forearm | **нет — открытый пункт** | — | — | — |
| assisted_pull_up | Подтягивания с резиной | v_pull | upper-back / Бицепс | **нет — открытый пункт** | — | — | — |
| lat_pulldown | Тяга верхнего блока | v_pull | upper-back / Бицепс, forearm | assets/anim/lat_pulldown.webp (266 КБ) | собственный 3D-рендер RYNJI (tools/anim), права наши | да | да |
| close_grip_pulldown | Тяга верхнего блока узким хватом | v_pull | upper-back / Бицепс | **нет — открытый пункт** | — | — | — |
| barbell_row | Тяга штанги в наклоне | h_pull | upper-back / Бицепс, lower-back, deltoids, trapezius | **нет — открытый пункт** | — | — | — |
| db_row | Тяга гантели одной рукой | h_pull | upper-back / Бицепс, deltoids | assets/anim/db_row.webp (115 КБ) | собственный 3D-рендер RYNJI (tools/anim), права наши | да | да |
| seated_cable_row | Тяга горизонтального блока | h_pull | upper-back / Бицепс, trapezius, lower-back | **нет — открытый пункт** | — | — | — |
| tbar_row | Тяга Т-грифа | h_pull | upper-back / Бицепс, trapezius, lower-back | **нет — открытый пункт** | — | — | — |
| chest_supported_row | Тяга гантелей лёжа на наклонной | h_pull | upper-back / deltoids, Бицепс | **нет — открытый пункт** | — | — | — |
| machine_row | Тяга в рычажном тренажёре | h_pull | upper-back / Бицепс, deltoids | **нет — открытый пункт** | — | — | — |
| inverted_row | Горизонтальные подтягивания | h_pull | upper-back / Бицепс, deltoids | **нет — открытый пункт** | — | — | — |
| straight_arm_pulldown | Пуловер на блоке прямыми руками | v_pull | upper-back / Трицепс | **нет — открытый пункт** | — | — | — |
| db_pullover | Пуловер с гантелью | v_pull | upper-back, Грудь / Трицепс | **нет — открытый пункт** | — | — | — |
| back_extension | Гиперэкстензия | hinge | lower-back, gluteal / hamstring | **нет — открытый пункт** | — | — | — |
| superman | Супермен | hinge | lower-back / gluteal | **нет — открытый пункт** | — | — | — |
| shrug | Шраги со штангой | shrug | trapezius / forearm | **нет — открытый пункт** | — | — | — |
| db_shrug | Шраги с гантелями | shrug | trapezius / forearm | **нет — открытый пункт** | — | — | — |
| ohp | Жим штанги стоя | v_push | deltoids / Трицепс, trapezius, Пресс | **нет — открытый пункт** | — | — | — |
| seated_db_press | Жим гантелей сидя | v_push | deltoids / Трицепс | **нет — открытый пункт** | — | — | — |
| arnold_press | Жим Арнольда | v_push | deltoids / Трицепс | **нет — открытый пункт** | — | — | — |
| machine_shoulder_press | Жим в тренажёре для плеч | v_push | deltoids / Трицепс | **нет — открытый пункт** | — | — | — |
| lateral_raise | Махи гантелями в стороны | lateral | deltoids / trapezius | **нет — открытый пункт** | — | — | — |
| cable_lateral_raise | Махи в сторону на блоке | lateral | deltoids / — | **нет — открытый пункт** | — | — | — |
| front_raise | Подъём гантелей перед собой | lateral | deltoids / — | **нет — открытый пункт** | — | — | — |
| rear_delt_fly | Махи в наклоне (задняя дельта) | rear_delt | deltoids / upper-back, trapezius | **нет — открытый пункт** | — | — | — |
| reverse_pec_deck | Обратная бабочка | rear_delt | deltoids / upper-back | **нет — открытый пункт** | — | — | — |
| face_pull | Тяга каната к лицу | rear_delt | deltoids / upper-back, trapezius | **нет — открытый пункт** | — | — | — |
| upright_row | Тяга штанги к подбородку | lateral | deltoids, trapezius / Бицепс | **нет — открытый пункт** | — | — | — |
| pike_push_up | Отжимания в складке (pike) | v_push | deltoids / Трицепс, trapezius | **нет — открытый пункт** | — | — | — |
| band_pull_apart | Разведение резины | rear_delt | deltoids / upper-back, trapezius | **нет — открытый пункт** | — | — | — |
| barbell_curl | Подъём штанги на бицепс | curl | Бицепс / forearm | **нет — открытый пункт** | — | — | — |
| ez_curl | Подъём EZ-грифа на бицепс | curl | Бицепс / forearm | **нет — открытый пункт** | — | — | — |
| db_curl | Сгибания рук с гантелями | curl | Бицепс / forearm | assets/anim/db_curl.webp (202 КБ) | собственный 3D-рендер RYNJI (tools/anim), права наши | да | да |
| hammer_curl | Молотки | curl | Бицепс, forearm / — | **нет — открытый пункт** | — | — | — |
| incline_db_curl | Сгибания на наклонной скамье | curl | Бицепс / — | **нет — открытый пункт** | — | — | — |
| preacher_curl | Сгибания на скамье Скотта | curl | Бицепс / — | **нет — открытый пункт** | — | — | — |
| cable_curl | Сгибания на нижнем блоке | curl | Бицепс / forearm | **нет — открытый пункт** | — | — | — |
| concentration_curl | Концентрированный подъём | curl | Бицепс / — | **нет — открытый пункт** | — | — | — |
| band_curl | Сгибания с резиной | curl | Бицепс / — | **нет — открытый пункт** | — | — | — |
| close_grip_bench | Жим узким хватом | h_push | Трицепс / Грудь, deltoids | **нет — открытый пункт** | — | — | — |
| skullcrusher | Французский жим лёжа | tri_ext | Трицепс / — | **нет — открытый пункт** | — | — | — |
| triceps_pushdown | Разгибания на блоке | tri_ext | Трицепс / — | **нет — открытый пункт** | — | — | — |
| rope_pushdown | Разгибания с канатом | tri_ext | Трицепс / — | **нет — открытый пункт** | — | — | — |
| overhead_cable_ext | Разгибание из-за головы на блоке | tri_ext | Трицепс / — | **нет — открытый пункт** | — | — | — |
| db_overhead_ext | Разгибание гантели из-за головы | tri_ext | Трицепс / — | **нет — открытый пункт** | — | — | — |
| triceps_dip | Отжимания на брусьях (трицепс) | v_push | Трицепс / Грудь, deltoids | **нет — открытый пункт** | — | — | — |
| bench_dip | Обратные отжимания от скамьи | tri_ext | Трицепс / Грудь, deltoids | **нет — открытый пункт** | — | — | — |
| db_kickback | Разгибание руки в наклоне | tri_ext | Трицепс / — | **нет — открытый пункт** | — | — | — |
| diamond_push_up | Отжимания узким упором | h_push | Трицепс / Грудь | **нет — открытый пункт** | — | — | — |
| back_squat | Приседания со штангой | squat | quadriceps, gluteal / adductors, hamstring, lower-back | assets/anim/back_squat.webp (239 КБ) | собственный 3D-рендер RYNJI (tools/anim), права наши | да | да |
| front_squat | Фронтальные приседания | squat | quadriceps / gluteal, Пресс | **нет — открытый пункт** | — | — | — |
| goblet_squat | Гоблет-присед | squat | quadriceps, gluteal / adductors, Пресс | **нет — открытый пункт** | — | — | — |
| leg_press | Жим ногами | squat | quadriceps, gluteal / adductors, hamstring | **нет — открытый пункт** | — | — | — |
| hack_squat | Гакк-приседания | squat | quadriceps / gluteal, adductors | **нет — открытый пункт** | — | — | — |
| smith_squat | Приседания в Смите | squat | quadriceps, gluteal / hamstring | **нет — открытый пункт** | — | — | — |
| bulgarian_split_squat | Болгарские выпады | lunge | quadriceps, gluteal / adductors, hamstring | **нет — открытый пункт** | — | — | — |
| walking_lunge | Выпады с гантелями | lunge | quadriceps, gluteal / hamstring, adductors | **нет — открытый пункт** | — | — | — |
| bodyweight_lunge | Выпады без веса | lunge | quadriceps, gluteal / hamstring | **нет — открытый пункт** | — | — | — |
| bodyweight_squat | Приседания без веса | squat | quadriceps, gluteal / adductors | **нет — открытый пункт** | — | — | — |
| step_up | Зашагивания на тумбу | lunge | quadriceps, gluteal / hamstring | **нет — открытый пункт** | — | — | — |
| leg_extension | Разгибание ног в тренажёре | leg_ext | quadriceps / — | **нет — открытый пункт** | — | — | — |
| romanian_deadlift | Румынская тяга | hinge | hamstring, gluteal / lower-back, forearm | assets/anim/romanian_deadlift.webp (244 КБ) | собственный 3D-рендер RYNJI (tools/anim), права наши | да | да |
| db_rdl | Румынская тяга с гантелями | hinge | hamstring, gluteal / lower-back | **нет — открытый пункт** | — | — | — |
| lying_leg_curl | Сгибание ног лёжа | leg_curl | hamstring / Икры | **нет — открытый пункт** | — | — | — |
| seated_leg_curl | Сгибание ног сидя | leg_curl | hamstring / — | **нет — открытый пункт** | — | — | — |
| nordic_curl | Нордические сгибания | leg_curl | hamstring / gluteal | **нет — открытый пункт** | — | — | — |
| good_morning | Наклоны со штангой (гуд-монинг) | hinge | hamstring, lower-back / gluteal | **нет — открытый пункт** | — | — | — |
| adductor_machine | Сведение ног в тренажёре | leg_ext | adductors / — | **нет — открытый пункт** | — | — | — |
| hip_thrust | Ягодичный мост со штангой | glute | gluteal / hamstring, quadriceps | **нет — открытый пункт** | — | — | — |
| glute_bridge | Ягодичный мост | glute | gluteal / hamstring | **нет — открытый пункт** | — | — | — |
| single_leg_bridge | Мост на одной ноге | glute | gluteal / hamstring | **нет — открытый пункт** | — | — | — |
| cable_kickback | Отведение ноги назад на блоке | glute | gluteal / hamstring | **нет — открытый пункт** | — | — | — |
| abductor_machine | Разведение ног в тренажёре | glute | gluteal / — | **нет — открытый пункт** | — | — | — |
| kb_swing | Махи гирей | hinge | gluteal, hamstring / lower-back, deltoids, forearm | **нет — открытый пункт** | — | — | — |
| standing_calf_raise | Подъём на носки стоя | calf | Икры / — | **нет — открытый пункт** | — | — | — |
| seated_calf_raise | Подъём на носки сидя | calf | Икры / — | **нет — открытый пункт** | — | — | — |
| db_calf_raise | Подъём на носки с гантелью | calf | Икры / — | **нет — открытый пункт** | — | — | — |
| leg_press_calf | Икры в жиме ногами | calf | Икры / — | **нет — открытый пункт** | — | — | — |
| plank | Планка | core · на время | Пресс / obliques, deltoids | **нет — открытый пункт** | — | — | — |
| side_plank | Боковая планка | core · на время | obliques / Пресс | **нет — открытый пункт** | — | — | — |
| crunch | Скручивания | core | Пресс / — | **нет — открытый пункт** | — | — | — |
| cable_crunch | Скручивания на блоке | core | Пресс / obliques | **нет — открытый пункт** | — | — | — |
| hanging_leg_raise | Подъём ног в висе | core | Пресс / obliques | **нет — открытый пункт** | — | — | — |
| reverse_crunch | Обратные скручивания | core | Пресс / — | **нет — открытый пункт** | — | — | — |
| ab_wheel | Ролик для пресса | core | Пресс / upper-back, deltoids | **нет — открытый пункт** | — | — | — |
| russian_twist | Русские скручивания | core | obliques / Пресс | **нет — открытый пункт** | — | — | — |
| dead_bug | Мёртвый жук | core | Пресс / obliques | **нет — открытый пункт** | — | — | — |
| mountain_climber | Скалолаз | core | Пресс / quadriceps, deltoids | **нет — открытый пункт** | — | — | — |
| pallof_press | Паллоф-пресс | core | obliques, Пресс / — | **нет — открытый пункт** | — | — | — |
| wrist_curl | Сгибание запястий | grip | forearm / — | **нет — открытый пункт** | — | — | — |
| reverse_wrist_curl | Разгибание запястий | grip | forearm / — | **нет — открытый пункт** | — | — | — |
| reverse_curl | Подъём штанги обратным хватом | curl | forearm / Бицепс | **нет — открытый пункт** | — | — | — |
| farmers_walk | Прогулка фермера | carry · на время | forearm, trapezius / Пресс, gluteal, quadriceps | **нет — открытый пункт** | — | — | — |
| clean_press | Взятие на грудь и жим | v_push | deltoids, quadriceps, gluteal / trapezius, hamstring, Трицепс, lower-back | **нет — открытый пункт** | — | — | — |
| thruster_db | Трастеры с гантелями | squat | quadriceps, deltoids / gluteal, Трицепс | **нет — открытый пункт** | — | — | — |
| kb_goblet_press | Турецкий подъём | core | deltoids, Пресс / gluteal, obliques, Трицепс | **нет — открытый пункт** | — | — | — |

## Проверка биомеханики

- **Жим штанги лёжа** (`bench_press`): Лопатки сведены, небольшой прогиб, стопы на полу; гриф к нижней части груди, локти ~45°; выжим до прямых рук над плечами. Ракурс: сверху со стороны ног.
- **Тяга верхнего блока** (`lat_pulldown`): Бёдра под валиками, хват шире плеч; гриф к верху груди, локти вниз и назад, отклонение ~15°; вверх до почти прямых рук. Ракурс: сзади-сбоку.
- **Тяга гантели одной рукой** (`db_row`): Колено и ладонь на скамье, спина параллельна полу; локоть вверх и назад к поясу вдоль корпуса; опускание до прямой руки. Ракурс: сзади-сбоку.
- **Сгибания рук с гантелями** (`db_curl`): Локти у корпуса и неподвижны, ладони вперёд; сгибание до ~140° без раскачки, медленное опускание. Ракурс: спереди-сбоку.
- **Приседания со штангой** (`back_squat`): До параллели бедра; таз назад и вниз, колени по линии носков, пятки на полу, корпус ~40°, спина нейтральна; гриф на трапециях. Ракурс: спереди-сбоку.
- **Румынская тяга** (`romanian_deadlift`): Колени мягкие и почти неподвижны; таз назад, спина ровная, гриф вдоль ног до середины голени; подъём разгибанием таза. Ракурс: сзади-сбоку.
