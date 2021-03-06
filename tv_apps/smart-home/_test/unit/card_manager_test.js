'use strict';

/* global CardManager */

require('/tv_shared/js/vendor/evt.js');
require('/shared/js/uuid.js');
require('/tv_shared/js/shared_utils.js');
require('/test/unit/mock_piped_promise.js');
require('/test/unit/mock_card_store.js');
require('/test/unit/mock_xml_http_request.js');
require('/tv_shared/js/cards/card.js');
require('/tv_shared/js/cards/deck.js');
require('/tv_shared/js/cards/folder.js');
require('/tv_shared/js/cards/application.js');
require('/tv_shared/js/cards/app_bookmark.js');

suite('smart-home/CardManager', function() {
  var realPipedPromise;

  suiteSetup(function(done) {
    realPipedPromise = window.PipedPromise;
    // real PipedPromise will make test failed because it waits for
    // last promise to be resolved. But we need to call done in the last
    // promise. So we use a MockPipedPromise (which is just a genuine native
    // Promise) instead.
    window.PipedPromise = MockPipedPromise;
    require('/tv_shared/js/card_manager.js', function() {
      done();
    });
  });

  suiteTeardown(function() {
    window.PipedPromise = realPipedPromise;
  });

  suite('_bestMatchingIcon', function() {
    var cardManager;
    var app;
    var manifestWithIconsInOrder = {
      icons: {
        '32': '/style/icons/32.png',
        '64': '/style/icons/64.png',
        '128': '/style/icons/128.png',
        '256': '/style/icons/256.png'
      }
    };
    var manifestWithIconsInRandom = {
      icons: {
        '32': '/style/icons/32.png',
        '256': '/style/icons/256.png',
        '128': '/style/icons/128.png',
        '64': '/style/icons/64.png'
      }
    };

    setup(function() {
      cardManager = new CardManager();
      app = {
        origin: 'app://stub.gaiamobile.org/'
      };
    });

    teardown(function() {
      cardManager = undefined;
      app = undefined;
    });

    test('call without preferredSize', function() {
      var actual = cardManager._bestMatchingIcon(app, manifestWithIconsInOrder);
      assert.equal(actual, 'app://stub.gaiamobile.org/style/icons/256.png');
    });

    test('call with random order of icon size and ' +
      'without preferredSize ', function() {
      var actual =
        cardManager._bestMatchingIcon(app, manifestWithIconsInRandom);
      assert.equal(actual, 'app://stub.gaiamobile.org/style/icons/256.png');
    });

    test('call with preferredSize', function() {
      var actual =
        cardManager._bestMatchingIcon(app, manifestWithIconsInOrder, 100);
      assert.equal(actual, 'app://stub.gaiamobile.org/style/icons/128.png');
    });

    test('call with random order of icon size and ' +
      'preferredSize ', function() {
      var actual =
        cardManager._bestMatchingIcon(app, manifestWithIconsInRandom, 100);
      assert.equal(actual, 'app://stub.gaiamobile.org/style/icons/128.png');
    });

  });

  suite('_reloadCardList', function() {
    var cardManager;
    var realXMLHttpRequest;

    setup(function() {
      cardManager = new CardManager();
      cardManager._cardStore = MockCardStore;
      realXMLHttpRequest = window.XMLHttpRequest;
      window.XMLHttpRequest = MockXMLHttpRequest;
      this.sinon.spy(cardManager, 'writeCardlistInCardStore');
    });

    teardown(function() {
      MockCardStore.mClearData();
      window.XMLHttpRequest = realXMLHttpRequest;
      cardManager = undefined;
    });

    test('should load cardList from datastore if possible', function(done) {
      MockCardStore.mPrepareData('cardList', [{
        'name': 'Television',
        'type': 'Deck',
        'cachedIconURL': 'style/icons/Blank.png'
      }]);

      cardManager._reloadCardList().then(function() {
        assert.isTrue(cardManager._cardList.length > 0);
        assert.equal(cardManager._cardList[0].name, 'Television');
      }, function(reason) {
        assert.fail('should not reject promise due to ' + reason);
      }).then(done, done);
    });

    test('should load cardList from file if nothing in datastore',
      function(done) {
        cardManager._reloadCardList().then(function() {
          assert.isTrue(cardManager._cardList.length > 0);
          assert.equal(cardManager._cardList[0].name, 'Devices');
          assert.isTrue(cardManager.writeCardlistInCardStore.calledOnce);
        }, function(reason) {
          assert.fail('should not reject promise due to ' + reason);
        }).then(done, done);

        // XXX: We should remove window.setTimeout in test but since we are
        // guarding this test with done(), let's just put it as is until we
        // have better solution
        window.setTimeout(function() {
          MockXMLHttpRequest.triggerReadyStateChange({
            status: 200,
            response: {
              'card_list': [{
                  'name': 'Devices',
                  'type': 'Deck',
                  'cachedIconURL': 'style/icons/Blank.png'
              }]
            }
          });
        });
      });
  });

  suite('findCardFromCardList', function() {
    var cardManager;
    var dashboardCardId;
    setup(function() {
      cardManager = new CardManager();
      cardManager._cardList = [
        new Deck({
          name: 'Dashboard',
          cachedIconURL: 'style/icons/Blank.png'
        })
      ];
      dashboardCardId = cardManager._cardList[0].cardId;
    });

    teardown(function() {
      cardManager = undefined;
    });

    test('should find card based on cardId', function() {
      var card = cardManager.findCardFromCardList({
        cardId: dashboardCardId
      });
      assert.equal(card.name, 'Dashboard');
    });

    test('should return undefined if not found', function() {
      var card = cardManager.findCardFromCardList({
        cardId: 'incorrect-card-id'
      });
      assert.isUndefined(card);
    });

  });

  suite('insertNewFolder', function() {
    var cardManager;
    var dashboardCardId;
    setup(function() {
      cardManager = new CardManager();
      cardManager._cardStore = MockCardStore;
      cardManager._cardList = [
        new Deck({
          name: 'Dashboard',
          cachedIconURL: 'style/icons/Blank.png'
        })
      ];
      dashboardCardId = cardManager._cardList[0].cardId;

      this.sinon.spy(cardManager, 'writeFolderInCardStore');
      this.sinon.spy(cardManager, 'writeCardlistInCardStore');
    });

    teardown(function() {
      MockCardStore.mClearData();
      cardManager = undefined;
    });

    test('should return new folder instance whenever a new folder is inserted',
      function() {
        var newFolder = cardManager.insertNewFolder('an empty folder');

        assert.ok(newFolder.folderId);
        assert.equal(newFolder.state, Folder.STATES.DETACHED);
      });

    test('should write to data store when folder has content', function() {
      var newFolder = cardManager.insertNewFolder('a test folder');
      assert.isFalse(cardManager.writeCardlistInCardStore.calledOnce);
      newFolder.addCard(new Application({
        name: 'Music',
        cachedIconURL: 'style/icons/Blank.png'
      }));

      assert.isTrue(cardManager.writeCardlistInCardStore.calledOnce);
    });

    test('should insert at correct location if index is specified', function() {
      var targetLocation = 0;
      var newFolder =
        cardManager.insertNewFolder('a test folder', targetLocation);
      assert.isFalse(cardManager.writeCardlistInCardStore.calledOnce);
      newFolder.addCard(new Application({
        name: 'Music',
        cachedIconURL: 'style/icons/Blank.png'
      }));

      assert.isTrue(cardManager.writeCardlistInCardStore.calledOnce);
      assert.equal(cardManager._cardList[targetLocation], newFolder);
    });

  });

  suite('writeCardlistInCardStore', function() {
    var cardManager;
    var emptyFolder, secondEmptyFolder;

    setup(function() {
      cardManager = new CardManager();
      cardManager._cardStore = MockCardStore;

      emptyFolder = new Folder({
        name: 'New Folder'
      });

      secondEmptyFolder = new Folder({
        name: 'New Folder 2'
      });

      cardManager._cardList = [
        new Deck({
          name: 'Dashboard',
          cachedIconURL: 'style/icons/Blank.png'
        }),
        emptyFolder,
        secondEmptyFolder,
        new Application({
          name: 'Music',
          nativeApp: {}
        })
      ];
    });

    teardown(function() {
      MockCardStore.mClearData();
      cardManager = undefined;
    });

    test('write with empty folder should eliminate it from card list',
      function(done) {
        var expectedLength = cardManager._cardList.length - 2;

        cardManager.writeCardlistInCardStore({
          cleanEmptyFolder: true
        }).then(function() {
          assert.equal(cardManager._cardList.length, expectedLength);
          assert.isTrue(cardManager._cardList.indexOf(emptyFolder) < 0);
          done();
        });
      });
  });

});
