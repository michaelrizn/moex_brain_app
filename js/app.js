console.log('app.js загружен');

// Функция для получения текущей цены акций через API Московской биржи
async function getCurrentPrice(stockIds) {
    const stocks = stockIds.split(',');
    const results = {};

    for (const stock of stocks) {
        const url = `https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities/${stock}.json?iss.meta=off&iss.only=securities,marketdata&securities.columns=SECID,PREVPRICE&marketdata.columns=LAST`;
        console.log(`Запрос к URL: ${url}`);
        
        try {
            const response = await fetch(url);
            console.log('Ответ получен:', response);
            const data = await response.json();
            console.log('Данные получены:', data);

            if (data.securities && data.securities.data && data.securities.data.length > 0 &&
                data.marketdata && data.marketdata.data && data.marketdata.data.length > 0) {
                const prevPrice = data.securities.data[0][1];
                const currentPrice = data.marketdata.data[0][0] || prevPrice;

                results[stock] = {
                    rub: currentPrice,
                    prev_rub: prevPrice
                };
            } else {
                console.error(`Неверный формат данных для ${stock}`);
                results[stock] = null;
            }
        } catch (error) {
            console.error(`Ошибка при получении цены для ${stock}:`, error);
            results[stock] = null;
        }
    }

    return results;
}

// Функция для предсказания цены на основе последовательностей
async function predictPrice(sequences, currentPrice, updateProgress) {
    const hiddenNeurons = parseInt(document.getElementById('hidden-neurons').value);
    const iterations = parseInt(document.getElementById('iterations').value);
    const learningRate = parseFloat(document.getElementById('learning-rate').value) / 10000;

    // Преобразование входных данных
    const flattenedSequences = sequences.map(seq => Array.isArray(seq[0]) ? seq[0].concat(seq[1]) : seq);
    
    console.log('Пример преобразованной последовательности:', flattenedSequences[0]);

    // Подготовка данных
    const flatPrices = flattenedSequences.flat();
    const min = Math.min(...flatPrices);
    const max = Math.max(...flatPrices);
    
    console.log('Min:', min, 'Max:', max);

    if (max === min) {
        throw new Error('Все цены одинаковые, невозможно нормализовать данные');
    }

    // Нормализация данных
    const normalizedSequences = flattenedSequences.map(seq => 
        seq.map(price => (price - min) / (max - min))
    );

    console.log('Пример нормализованной последовательности:', normalizedSequences[0]);

    const inputSize = normalizedSequences[0].length - 1;
    const outputSize = 1;

    // Подготовка данных для обучения
    const trainingData = normalizedSequences.map(seq => ({
        input: seq.slice(0, inputSize),
        output: [seq[seq.length - 1]]
    }));

    console.log('Пример обучающих данных:', trainingData[0]);

    // Создаем простую нейронную сеть прямого распространения
    const net = new brain.NeuralNetwork({
        inputSize: inputSize,
        hiddenLayers: [hiddenNeurons],
        outputSize: outputSize,
        learningRate: learningRate
    });

    try {
        // Обучение сети
        const results = await net.trainAsync(trainingData, {
            iterations: iterations,
            errorThresh: 0.005,
            log: true,
            logPeriod: 10,
            callback: (data) => {
                console.log(`Iteration: ${data.iterations}, Error: ${data.error}`);
                updateProgress((data.iterations / iterations) * 100);
            }
        });

        console.log('Результаты обучения:', results);

        // Нормализация текущей цены
        const normalizedCurrentPrice = (currentPrice - min) / (max - min);
        
        // Прогноз на 24 часа вперед
        let prediction = normalizedCurrentPrice;
        let input = normalizedSequences[normalizedSequences.length - 1].slice(0, inputSize);
        
        // Рассчитываем волатильность на основе последних 30 значений
        const recentPrices = sequences.slice(-30).map(seq => seq[1]);
        const volatility = calculateVolatility(recentPrices);
        
        for (let i = 0; i < 24; i++) {
            const hourlyPrediction = net.run(input)[0];
            // Применяем усиленный фактор затухания
            const decayFactor = Math.exp(-i / 12); // Увеличили скорость затухания
            prediction = prediction * (1 - decayFactor) + hourlyPrediction * decayFactor;
            input.shift();
            input.push(prediction);
        }
        
        // Денормализация предсказания
        const denormalizedPrediction = prediction * (max - min) + min;
        
        // Ограничение максимального изменения цены с учетом волатильности
        const maxChangePercent = Math.min(volatility, 2); // Максимум 2% или волатильность, что меньше
        const maxChange = currentPrice * (maxChangePercent / 100);
        
        // Дополнительное ограничение на основе исторической волатильности
        const historicalVolatility = calculateHistoricalVolatility(sequences);
        const volatilityLimit = currentPrice * (historicalVolatility / 100);
        
        const limitedPrediction = Math.max(
            Math.min(denormalizedPrediction, currentPrice + Math.min(maxChange, volatilityLimit)),
            currentPrice - Math.min(maxChange, volatilityLimit)
        );
        
        return limitedPrediction;
    } catch (error) {
        console.error('Ошибка при обучении сети:', error);
        throw error;
    }
}

// Функция для расчета волатильности
function calculateVolatility(prices) {
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
        returns.push((prices[i] - prices[i-1]) / prices[i-1]);
    }
    const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
    const squaredDifferences = returns.map(value => Math.pow(value - mean, 2));
    const variance = squaredDifferences.reduce((sum, value) => sum + value, 0) / squaredDifferences.length;
    return Math.sqrt(variance) * 100; // Возвращаем в процентах
}

// Функция для расчета исторической волатильности
function calculateHistoricalVolatility(sequences) {
    const prices = sequences.map(seq => seq[1]);
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
        returns.push(Math.log(prices[i] / prices[i-1]));
    }
    const stdDev = Math.sqrt(returns.reduce((sum, value) => sum + Math.pow(value, 2), 0) / returns.length);
    return stdDev * Math.sqrt(252) * 100; // Годовая волатильность в процентах
}

document.addEventListener('DOMContentLoaded', () => {
    const predictButton = document.getElementById('predict');
    predictButton.textContent = 'Start';
    const loadingElement = document.getElementById('loading');
    
    const speedAccuracySlider = document.getElementById('speed-accuracy');
    const hiddenNeuronsSlider = document.getElementById('hidden-neurons');
    const iterationsSlider = document.getElementById('iterations');
    const batchSizeSlider = document.getElementById('batch-size');
    const learningRateSlider = document.getElementById('learning-rate');
    const errorThreshSlider = document.getElementById('error-thresh');

    const hiddenNeuronsValue = document.getElementById('hidden-neurons-value');
    const iterationsValue = document.getElementById('iterations-value');
    const batchSizeValue = document.getElementById('batch-size-value');
    const learningRateValue = document.getElementById('learning-rate-value');
    const errorThreshValue = document.getElementById('error-thresh-value');

    function updateSliders() {
        const speedAccuracy = speedAccuracySlider.value / 100;

        hiddenNeuronsSlider.value = Math.round(15 * (1 - speedAccuracy) + 5);
        iterationsSlider.value = Math.round(450 * speedAccuracy + 50);
        batchSizeSlider.value = Math.round(45 * (1 - speedAccuracy) + 5);
        learningRateSlider.value = Math.round(99 * (1 - speedAccuracy) + 1);
        errorThreshSlider.value = Math.round(99 * (1 - speedAccuracy) + 1);

        updateSliderValues();
    }

    function updateSliderValues() {
        hiddenNeuronsValue.textContent = hiddenNeuronsSlider.value;
        iterationsValue.textContent = iterationsSlider.value;
        batchSizeValue.textContent = batchSizeSlider.value;
        learningRateValue.textContent = (learningRateSlider.value / 10000).toFixed(4);
        errorThreshValue.textContent = (errorThreshSlider.value / 1000).toFixed(3);
    }

    speedAccuracySlider.addEventListener('input', updateSliders);
    hiddenNeuronsSlider.addEventListener('input', updateSliderValues);
    iterationsSlider.addEventListener('input', updateSliderValues);
    batchSizeSlider.addEventListener('input', updateSliderValues);
    learningRateSlider.addEventListener('input', updateSliderValues);
    errorThreshSlider.addEventListener('input', updateSliderValues);

    updateSliders();

    if (predictButton) {
        console.log('Кнопка Start найдена');
        predictButton.addEventListener('click', async () => {
            console.log('Кнопка Start нажата');
            loadingElement.style.display = 'block';
            predictButton.disabled = true;

            try {
                // Получаем текущие цены для акций SBER и MGNT
                loadingElement.textContent = 'Получение текущих цен...';
                const prices = await getCurrentPrice('SBER,MGNT');
                console.log('Текущие цены:', prices);

                if (!prices.SBER && !prices.MGNT) {
                    throw new Error('Не удалось получить цены для обеих акций');
                }

                // Обрабатываем SBER
                if (prices.SBER) {
                    const sberCurrentPrice = prices.SBER.rub;
                    console.log('Текущая цена SBER:', sberCurrentPrice);
                    loadingElement.textContent = 'Предсказание цены SBER: 0%';
                    const sberPredictedPrice = await predictPrice(window.sberSequences, sberCurrentPrice, progress => {
                        loadingElement.textContent = `Предсказание цены SBER: ${progress.toFixed(0)}%`;
                    });
                    console.log('Предсказанная цена SBER:', sberPredictedPrice);
                    const sberDifference = sberPredictedPrice - sberCurrentPrice;
                    const sberPercentChange = (sberDifference / sberCurrentPrice) * 100;
                    document.getElementById('sber-result').textContent = `SBER: ${formatResult(sberCurrentPrice, sberPredictedPrice, sberDifference, sberPercentChange)}`;
                } else {
                    document.getElementById('sber-result').textContent = 'Ошибка при получении данных SBER';
                }

                // Обрабатываем MGNT
                if (prices.MGNT) {
                    const mgntCurrentPrice = prices.MGNT.rub;
                    console.log('Текущая цена MGNT:', mgntCurrentPrice);
                    loadingElement.textContent = 'Предсказание цены MGNT: 0%';
                    const mgntPredictedPrice = await predictPrice(window.mgntSequences, mgntCurrentPrice, progress => {
                        loadingElement.textContent = `Предсказание цены MGNT: ${progress.toFixed(0)}%`;
                    });
                    console.log('Предсказанная цена MGNT:', mgntPredictedPrice);
                    const mgntDifference = mgntPredictedPrice - mgntCurrentPrice;
                    const mgntPercentChange = (mgntDifference / mgntCurrentPrice) * 100;
                    document.getElementById('mgnt-result').textContent = `MGNT: ${formatResult(mgntCurrentPrice, mgntPredictedPrice, mgntDifference, mgntPercentChange)}`;
                } else {
                    document.getElementById('mgnt-result').textContent = 'Ошибка при получении данных MGNT';
                }
            } catch (error) {
                console.error('Ошибка предсказания:', error);
                document.getElementById('sber-result').textContent = `Ошибка при получении данных: ${error.message}`;
                document.getElementById('mgnt-result').textContent = `Ошибка при получении данных: ${error.message}`;
            } finally {
                loadingElement.style.display = 'none';
                predictButton.disabled = false;
                console.log('Загрузка завершена');
            }
        });
    } else {
        console.error('Кнопка Start не найдена');
    }
});

function formatResult(currentPrice, predictedPrice, difference, percentChange) {
    const signDifference = difference >= 0 ? '+' : '-';
    const signPercentChange = percentChange >= 0 ? '+' : '-';
    return `${currentPrice.toFixed(2)} ₽ ${signDifference} ${Math.abs(difference).toFixed(2)} ₽ = ${predictedPrice.toFixed(2)} ₽ (${signPercentChange}${Math.abs(percentChange).toFixed(2)}%)`;
}

console.log('sberSequences:', window.sberSequences);
console.log('mgntSequences:', window.mgntSequences);

function checkSequences(sequences, name) {
    if (!Array.isArray(sequences) || sequences.length === 0) {
        console.error(`${name} не является массивом или пуст`);
        return false;
    }
    const isValid = sequences.every(seq => Array.isArray(seq) && seq.length === 2 && Array.isArray(seq[0]) && typeof seq[1] === 'number');
    if (!isValid) {
        console.error(`${name} содержит некорректные последовательности`);
        console.log('Пример последовательности:', sequences[0]);
        return false;
    }
    console.log(`${name} прошел проверку. Количество последовательностей: ${sequences.length}, длина первой последовательности: ${sequences[0][0].length + 1}`);
    return true;
}

checkSequences(window.sberSequences, 'sberSequences');
checkSequences(window.mgntSequences, 'mgntSequences');

console.log('Пример последовательности SBER:', window.sberSequences[0]);
console.log('Пример последовательности MGNT:', window.mgntSequences[0]);