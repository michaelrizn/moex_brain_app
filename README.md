Прогнозирование цен акций с использованием нейросетей и промпт-инжиниринга
Простестировать можно в боте https://t.me/moex_brain_app_bot

Описание проекта:
Этот проект был создан с помощью промпт-инжиниринга и предназначен для анализа и прогнозирования цен акций российских компаний. Используются исторические данные акций с Московской биржи (MOEX) и нейронные сети на базе библиотеки brain.min.js. Прогнозирование выполняется на основе последовательностей цен за последние 365 дней.

Основные компоненты:

	1.	Источники данных: Акции SBER и MAGN (Магнит), данные загружаются через API MOEX.
	2.	Нейросеть: Для анализа используется нейронная сеть типа LSTM, которая обучается на исторических данных для предсказания будущих цен.
	3.	Интерфейс: Через веб-интерфейс пользователь может задавать параметры модели, такие как количество итераций и скорость обучения, чтобы получить прогноз на основе текущих данных.

Инструкции:

	•	Скрипт автоматически собирает исторические данные и сохраняет их в формате JS/JSON.
	•	Прогноз отображается в виде графика на веб-странице, позволяя анализировать будущее поведение цен акций.

Использование API MOEX:
Проект использует API Московской биржи для получения котировок акций за последние 365 дней. Прогнозирование строится на базе этих данных, что позволяет пользователям отслеживать возможные тренды в будущем.

Настройка:

	1.	Склонируйте репозиторий проекта.
	2.	Установите все необходимые зависимости, такие как brain.min.js.
	3.	Запустите проект, настроив нейросеть для обучения и предсказания.

Важные моменты:

    •	В файлах mgnt_sequences.js и sber_sequences.js (и т.п.) обязательно добавьте следующую строку в конце файла, чтобы данные были доступны для использования в браузере:
    •	window.sberSequences = sberSequences;
    •	window.mgntSequences = mgntSequences;
    •	И удалить строку export в начале файлов;

Код для Kaggle:

```python
# 1. Импорт библиотек
import requests
import pandas as pd
import json
from datetime import datetime, timedelta

# 2. Список акций
stocks = [
    {'id': 'SBER', 'name': 'sber'},
    {'id': 'MGNT', 'name': 'mgnt'}
]

# 3. Функция для получения данных с Московской биржи (ISS API) за последние 365 дней
def get_data(stock_id):
    end_date = datetime.now().strftime('%Y-%m-%d')
    start_date = (datetime.now() - timedelta(days=365)).strftime('%Y-%m-%d')
    
    url = f"https://iss.moex.com/iss/history/engines/stock/markets/shares/boards/TQBR/securities/{stock_id}.json"
    params = {
        'iss.meta': 'off',  # Отключаем метаданные для упрощения ответа
        'from': start_date,
        'till': end_date
    }
    
    response = requests.get(url, params=params)
    data = response.json()
    
    # Преобразование данных в DataFrame
    df = pd.DataFrame(data['history']['data'], columns=data['history']['columns'])
    
    return df[['TRADEDATE', 'CLOSE']].rename(columns={'TRADEDATE': 'timestamp', 'CLOSE': 'close'})

# 4. Функция для создания последовательностей данных
def create_sequences(data, seq_length=60):
    sequences = []
    for i in range(len(data) - seq_length):
        seq = data.iloc[i:i + seq_length]['close'].values.tolist()
        label = data.iloc[i + seq_length]['close']
        sequences.append((seq, label))
    return sequences

# 5. Функция для сохранения последовательностей в JS файлы
def save_sequences_to_js(sequences, var_name, filename):
    js_content = f"export const {var_name} = {json.dumps(sequences)};"
    with open(filename, 'w') as f:
        f.write(js_content)

# 6. Функция для сохранения последовательностей в JSON файлы
def save_sequences_to_json(sequences, filename):
    with open(filename, 'w') as f:
        json.dump(sequences, f)

# 7. Подготовка данных для каждой акции
for stock in stocks:
    data = get_data(stock['id'])
    if data is not None:
        data['price_normalized'] = (data['close'] - data['close'].min()) / (data['close'].max() - data['close'].min())
    
        sequences = create_sequences(data)
    
        # Сохранение в JS файл
        save_sequences_to_js(sequences, f"{stock['name']}Sequences", f"{stock['name']}_sequences.js")
    
        # Сохранение в JSON файл
        save_sequences_to_json(sequences, f"{stock['name']}_sequences.json")

# 8. Вывод сообщения о завершении
print("Данные успешно сохранены для всех акций.")
```

Этот код загружает исторические данные для SBER и MGNT, нормализует их, создает последовательности для обучения модели, а затем сохраняет данные в файлы .js и .json.
