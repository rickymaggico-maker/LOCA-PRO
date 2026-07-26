# LOCA PRO 0.0.3

Questa versione corregge la gestione delle stampe e dei documenti:

- anteprima visualizzata direttamente dentro LOCA PRO, senza dipendere
  dall'anteprima di Chromium;
- creazione reale dei PDF e apertura nel lettore predefinito di Windows;
- creazione di veri documenti `.docx` modificabili e apertura in Microsoft
  Word;
- formato pagina A4 con margini coerenti con il PDF;
- tabelle Word reali, con descrizioni e importi mantenuti in colonne
  separate e importi allineati a destra;
- selezione del proprietario e visualizzazione di tutte le locazioni
  collegate;
- selezione singola, multipla oppure di tutte le locazioni del proprietario;
- stampa cumulativa con una pagina autonoma per ogni locazione;
- per la periodicità trimestrale, scelta tra un unico bollettino trimestrale
  oppure tre bollettini mensili separati;
- per i contratti trimestrali, proposta predefinita di tre bollette mensili:
  ad esempio il 4° trimestre genera ottobre, novembre e dicembre su tre
  documenti distinti, ciascuno con il proprio periodo e la propria scadenza;
- calcolo indipendente di canone, oneri, recupero ISTAT e imposta di registro
  per ogni locazione selezionata;
- selezione facoltativa di un programma Windows (`.exe`) per l'apertura;
- salvataggio automatico dei file nella cartella
  `Documenti\LOCA PRO\Stampe`;
- pulsanti rapidi **Apri PDF / Stampa** e **Apri in Word** nell'anteprima.

La Dashboard e i dati locali della versione 0.0.2 restano invariati.

## Creazione dell'aggiornamento

1. Aprire il terminale di VS Code nella cartella del progetto.
2. Eseguire `npm.cmd install` solo se richiesto o se manca la cartella
   `node_modules`.
3. Eseguire `npm.cmd start` e verificare:
   - selezione del proprietario;
   - selezione di una o più locazioni;
   - trimestre in un unico bollettino;
   - trimestre in tre bollettini mensili;
   - anteprima, PDF e Word.
4. Eseguire `npm.cmd run build`.
5. Controllare che nella cartella `dist` siano presenti i tre file della
   versione 0.0.3.

## Pubblicazione della Release v0.0.3

Creare su GitHub una nuova Release con tag `v0.0.3` e allegare dalla cartella
`dist` tutti questi file:

- `LOCA-PRO-Setup-0.0.3.exe`
- `LOCA-PRO-Setup-0.0.3.exe.blockmap`
- `latest.yml`

La Release deve essere pubblicata, non lasciata come bozza e non impostata
come pre-release.

Una volta pubblicata, chi usa LOCA PRO 0.0.2 potrà ricevere la 0.0.3 dal
pulsante **Aggiornamenti** oppure tramite il controllo automatico all'avvio.
I dati locali non vengono cancellati dall'aggiornamento.
